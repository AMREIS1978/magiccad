package pt.autoperfect.camera

import android.content.ContentResolver
import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.net.Uri
import android.provider.MediaStore
import java.io.OutputStream
import kotlin.math.max
import kotlin.math.min

class PhotoProcessor {

    data class ResultInfo(val uri: Uri, val width: Int, val height: Int)

    fun createWowVersion(
        resolver: ContentResolver,
        sourceUri: Uri,
        decision: OpenAiClient.AiDecision?
    ): Result<ResultInfo> = runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(sourceUri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) error("Fotografia inválida")

        // Mantém a edição robusta no Redmi: alvo ~16 MP para evitar OOM,
        // preservando o original em resolução total.
        val targetPixels = 16_000_000.0
        var sample = 1
        while ((bounds.outWidth / sample) * (bounds.outHeight / sample) > targetPixels * 1.35) sample *= 2

        val opts = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val original = resolver.openInputStream(sourceUri)?.use { BitmapFactory.decodeStream(it, null, opts) }
            ?: error("Não foi possível ler a fotografia")

        val toned = applyProfessionalTone(original, decision)
        val cleaned = adaptiveDenoise(toned, decision?.denoise ?: 28)
        val sharpened = unsharpMask(cleaned, decision?.sharpness ?: 42)
        val finalBitmap = microContrast(sharpened)

        if (toned !== original) toned.recycle()
        if (cleaned !== toned && cleaned !== original) cleaned.recycle()
        if (sharpened !== cleaned && sharpened !== original) sharpened.recycle()
        if (finalBitmap !== sharpened && finalBitmap !== original) {
            // finalBitmap é guardado abaixo antes de reciclar.
        }

        val name = "AUTOPERFECT_WOW_${System.currentTimeMillis()}"
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/AutoPerfect/WOW")
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
            ?: error("Não foi possível criar a versão WOW")
        resolver.openOutputStream(uri)?.use { out ->
            if (!finalBitmap.compress(Bitmap.CompressFormat.JPEG, 98, out)) error("Falha ao guardar WOW")
        } ?: error("Não foi possível escrever a versão WOW")

        val info = ResultInfo(uri, finalBitmap.width, finalBitmap.height)
        if (!finalBitmap.isRecycled) finalBitmap.recycle()
        if (!original.isRecycled) original.recycle()
        info
    }

    private fun applyProfessionalTone(src: Bitmap, d: OpenAiClient.AiDecision?): Bitmap {
        val saturationBoost = 1.08f + ((d?.saturation ?: 8) / 500f)
        val contrast = 1.10f
        val warmth = (d?.warmth ?: 2).coerceIn(-40, 40)
        val translate = (-0.5f * contrast + 0.5f) * 255f

        val cm = ColorMatrix().apply { setSaturation(saturationBoost.coerceIn(0.90f, 1.22f)) }
        val contrastMatrix = ColorMatrix(floatArrayOf(
            contrast,0f,0f,0f,translate,
            0f,contrast,0f,0f,translate,
            0f,0f,contrast,0f,translate,
            0f,0f,0f,1f,0f
        ))
        cm.postConcat(contrastMatrix)

        val warmMatrix = ColorMatrix(floatArrayOf(
            1f + warmth/800f,0f,0f,0f,0f,
            0f,1f,0f,0f,0f,
            0f,0f,1f - warmth/900f,0f,0f,
            0f,0f,0f,1f,0f
        ))
        cm.postConcat(warmMatrix)

        val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
            colorFilter = ColorMatrixColorFilter(cm)
        }
        canvas.drawBitmap(src, 0f, 0f, paint)
        return out
    }

    private fun adaptiveDenoise(src: Bitmap, strength: Int): Bitmap {
        if (strength < 12) return src.copy(Bitmap.Config.ARGB_8888, true)
        val scale = if (strength > 60) 0.72f else if (strength > 35) 0.82f else 0.90f
        val w = max(1, (src.width * scale).toInt())
        val h = max(1, (src.height * scale).toInt())
        val small = Bitmap.createScaledBitmap(src, w, h, true)
        val restored = Bitmap.createScaledBitmap(small, src.width, src.height, true)
        small.recycle()
        return restored
    }

    private fun unsharpMask(src: Bitmap, amount: Int): Bitmap {
        val w = src.width
        val h = src.height
        val out = src.copy(Bitmap.Config.ARGB_8888, true)
        if (w < 3 || h < 3) return out

        // Processa uma matriz de pixels completa apenas até ~16 MP; é executado em background.
        val pixels = IntArray(w * h)
        val result = IntArray(w * h)
        src.getPixels(pixels, 0, w, 0, 0, w, h)
        pixels.copyInto(result)
        val k = (amount.coerceIn(0, 100) / 100f) * 0.55f

        for (y in 1 until h - 1) {
            val row = y * w
            for (x in 1 until w - 1) {
                val i = row + x
                val c = pixels[i]
                val l = pixels[i - 1]
                val r = pixels[i + 1]
                val u = pixels[i - w]
                val dn = pixels[i + w]
                val rr = sharpenChannel(Color.red(c), Color.red(l), Color.red(r), Color.red(u), Color.red(dn), k)
                val gg = sharpenChannel(Color.green(c), Color.green(l), Color.green(r), Color.green(u), Color.green(dn), k)
                val bb = sharpenChannel(Color.blue(c), Color.blue(l), Color.blue(r), Color.blue(u), Color.blue(dn), k)
                result[i] = Color.argb(Color.alpha(c), rr, gg, bb)
            }
        }
        out.setPixels(result, 0, w, 0, 0, w, h)
        return out
    }

    private fun sharpenChannel(c: Int, l: Int, r: Int, u: Int, d: Int, k: Float): Int {
        val blur = (l + r + u + d) / 4f
        return (c + (c - blur) * k).toInt().coerceIn(0, 255)
    }

    private fun microContrast(src: Bitmap): Bitmap {
        val cm = ColorMatrix(floatArrayOf(
            1.045f,0f,0f,0f,-4f,
            0f,1.045f,0f,0f,-4f,
            0f,0f,1.045f,0f,-4f,
            0f,0f,0f,1f,0f
        ))
        val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        Canvas(out).drawBitmap(src, 0f, 0f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            colorFilter = ColorMatrixColorFilter(cm)
        })
        return out
    }
}
