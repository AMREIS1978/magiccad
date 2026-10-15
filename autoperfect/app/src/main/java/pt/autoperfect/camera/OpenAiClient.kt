package pt.autoperfect.camera

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

class OpenAiClient {
    data class AiDecision(
        val scene: String,
        val summary: String,
        val exposureComp: Int,
        val highlights: Int,
        val shadows: Int,
        val warmth: Int,
        val saturation: Int,
        val sharpness: Int,
        val denoise: Int
    )

    fun testKey(apiKey: String): Result<String> = runCatching {
        val body = JSONObject().apply {
            put("model", "gpt-6-luna")
            put("input", "Reply only with OK")
            put("max_output_tokens", 16)
        }
        val json = post(apiKey, body)
        extractText(json).ifBlank { "OK" }
    }

    fun analyzePhoto(apiKey: String, resolver: ContentResolver, uri: Uri): Result<AiDecision> = runCatching {
        val encoded = encodePreview(resolver, uri)
        val prompt = """
            You are the AUTO PERFECT photographic director for a Redmi Note 14 Pro 5G.
            Analyze this real photo conservatively. Never invent details. Return ONLY compact JSON with:
            scene (string), summary (short string), exposure_compensation (-3..3 integer),
            highlights (-100..100), shadows (-100..100), warmth (-100..100), saturation (-100..100),
            sharpness (0..100), denoise (0..100).
            Optimize for a natural, professional photograph while protecting skin, skies and architecture.
        """.trimIndent()

        val content = JSONArray()
            .put(JSONObject().put("type", "input_text").put("text", prompt))
            .put(JSONObject().put("type", "input_image").put("image_url", "data:image/jpeg;base64,$encoded"))

        val body = JSONObject().apply {
            put("model", "gpt-6-luna")
            put("input", JSONArray().put(JSONObject().put("role", "user").put("content", content)))
            put("max_output_tokens", 240)
        }

        val raw = extractText(post(apiKey, body)).trim()
        val cleaned = raw.removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
        val obj = JSONObject(cleaned)
        AiDecision(
            scene = obj.optString("scene", "AUTO PERFECT"),
            summary = obj.optString("summary", "IA aplicada"),
            exposureComp = obj.optInt("exposure_compensation", 0).coerceIn(-3, 3),
            highlights = obj.optInt("highlights", 0).coerceIn(-100, 100),
            shadows = obj.optInt("shadows", 0).coerceIn(-100, 100),
            warmth = obj.optInt("warmth", 0).coerceIn(-100, 100),
            saturation = obj.optInt("saturation", 0).coerceIn(-100, 100),
            sharpness = obj.optInt("sharpness", 35).coerceIn(0, 100),
            denoise = obj.optInt("denoise", 30).coerceIn(0, 100)
        )
    }

    private fun post(apiKey: String, body: JSONObject): JSONObject {
        val connection = (URL("https://api.openai.com/v1/responses").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = 30000
            doOutput = true
            setRequestProperty("Authorization", "Bearer $apiKey")
            setRequestProperty("Content-Type", "application/json")
        }
        connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val text = stream.bufferedReader().use { it.readText() }
        connection.disconnect()
        if (code !in 200..299) {
            val message = try { JSONObject(text).optJSONObject("error")?.optString("message") } catch (_: Exception) { null }
            throw IllegalStateException(message ?: "OpenAI HTTP $code")
        }
        return JSONObject(text)
    }

    private fun extractText(root: JSONObject): String {
        val output = root.optJSONArray("output") ?: return ""
        for (i in 0 until output.length()) {
            val item = output.optJSONObject(i) ?: continue
            val content = item.optJSONArray("content") ?: continue
            for (j in 0 until content.length()) {
                val c = content.optJSONObject(j) ?: continue
                val text = c.optString("text")
                if (text.isNotBlank()) return text
            }
        }
        return ""
    }

    private fun encodePreview(resolver: ContentResolver, uri: Uri): String {
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw IllegalStateException("Não foi possível ler a fotografia")
        val original = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: throw IllegalStateException("Fotografia inválida")
        val maxSide = 1280
        val scale = minOf(1f, maxSide.toFloat() / maxOf(original.width, original.height).toFloat())
        val bitmap = if (scale < 1f) Bitmap.createScaledBitmap(
            original,
            (original.width * scale).toInt().coerceAtLeast(1),
            (original.height * scale).toInt().coerceAtLeast(1),
            true
        ) else original
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 82, out)
        if (bitmap !== original) bitmap.recycle()
        original.recycle()
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }
}
