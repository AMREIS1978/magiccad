package pt.autoperfect.camera

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.provider.MediaStore
import android.view.ScaleGestureDetector
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.extensions.ExtensionMode
import androidx.camera.extensions.ExtensionsManager
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sqrt

class MainActivity : AppCompatActivity(), SensorEventListener {

    private lateinit var previewView: PreviewView
    private lateinit var sceneText: TextView
    private lateinit var scoreText: TextView
    private lateinit var statusText: TextView
    private lateinit var zoomText: TextView
    private lateinit var captureButton: Button
    private lateinit var zoom1Button: Button
    private lateinit var zoom2Button: Button
    private lateinit var zoom4Button: Button
    private lateinit var cameraExecutor: ExecutorService
    private lateinit var scaleDetector: ScaleGestureDetector

    private var imageCapture: ImageCapture? = null
    private var currentCamera: Camera? = null
    private var stability = 0.75f
    private lateinit var sensorManager: SensorManager
    private var gyro: Sensor? = null
    private var lastScore = 0
    private var currentZoom = 1f
    private var torchEnabled = false
    private var darkFrames = 0
    private var brightFrames = 0

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera()
            else Toast.makeText(this, "É necessário permitir acesso à câmara.", Toast.LENGTH_LONG).show()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        previewView = findViewById(R.id.previewView)
        sceneText = findViewById(R.id.sceneText)
        scoreText = findViewById(R.id.scoreText)
        statusText = findViewById(R.id.statusText)
        zoomText = findViewById(R.id.zoomText)
        captureButton = findViewById(R.id.captureButton)
        zoom1Button = findViewById(R.id.zoom1Button)
        zoom2Button = findViewById(R.id.zoom2Button)
        zoom4Button = findViewById(R.id.zoom4Button)

        cameraExecutor = Executors.newSingleThreadExecutor()
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        gyro = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

        captureButton.setOnClickListener { takePhoto() }
        zoom1Button.setOnClickListener { setZoom(1f) }
        zoom2Button.setOnClickListener { setZoom(2f) }
        zoom4Button.setOnClickListener { setZoom(4f) }

        scaleDetector = ScaleGestureDetector(this,
            object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                override fun onScale(detector: ScaleGestureDetector): Boolean {
                    val camera = currentCamera ?: return false
                    val zoomState = camera.cameraInfo.zoomState.value ?: return false
                    val wanted = (currentZoom * detector.scaleFactor)
                        .coerceIn(zoomState.minZoomRatio, zoomState.maxZoomRatio)
                    currentZoom = wanted
                    camera.cameraControl.setZoomRatio(wanted)
                    updateZoomText(wanted)
                    return true
                }
            })

        previewView.setOnTouchListener { _, event ->
            scaleDetector.onTouchEvent(event)
            true
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onStart() {
        super.onStart()
        gyro?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    override fun onStop() {
        sensorManager.unregisterListener(this)
        currentCamera?.cameraControl?.enableTorch(false)
        torchEnabled = false
        super.onStop()
    }

    private fun startCamera() {
        statusText.text = "A preparar AUTO PERFECT…"
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            val provider = providerFuture.get()
            val baseSelector = CameraSelector.DEFAULT_BACK_CAMERA

            val extFuture = ExtensionsManager.getInstanceAsync(this, provider)
            extFuture.addListener({
                val ext = extFuture.get()
                val selector = when {
                    ext.isExtensionAvailable(baseSelector, ExtensionMode.AUTO) ->
                        ext.getExtensionEnabledCameraSelector(baseSelector, ExtensionMode.AUTO)
                    ext.isExtensionAvailable(baseSelector, ExtensionMode.HDR) ->
                        ext.getExtensionEnabledCameraSelector(baseSelector, ExtensionMode.HDR)
                    else -> baseSelector
                }
                bindCamera(provider, selector)
            }, ContextCompat.getMainExecutor(this))
        }, ContextCompat.getMainExecutor(this))
    }

    private fun bindCamera(provider: ProcessCameraProvider, selector: CameraSelector) {
        val preview = Preview.Builder().build().also {
            it.setSurfaceProvider(previewView.surfaceProvider)
        }

        imageCapture = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
            .setJpegQuality(100)
            .setFlashMode(ImageCapture.FLASH_MODE_AUTO)
            .build()

        val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()

        analysis.setAnalyzer(cameraExecutor) { image ->
            val buffer = image.planes.firstOrNull()?.buffer
            var sum = 0L
            var count = 0
            if (buffer != null) {
                var i = buffer.position()
                val limit = buffer.limit()
                while (i < limit) {
                    sum += buffer.get(i).toInt() and 0xFF
                    count++
                    i += 16
                }
            }
            val luma = if (count > 0) sum.toDouble() / count else 100.0
            val exposureScore = (100.0 - abs(luma - 115.0) * 0.55).coerceIn(25.0, 100.0)
            val score = (exposureScore * 0.55 + stability * 100f * 0.45).roundToInt().coerceIn(0, 100)
            lastScore = score

            val scene = when {
                luma < 35 -> "Escuro · luz inteligente"
                luma < 58 -> "Noite · captura automática"
                luma > 190 -> "Luz intensa · proteção de altas luzes"
                else -> "AUTO PERFECT"
            }

            updateSmartTorch(luma)

            val hint = when {
                torchEnabled -> "Luz inteligente ativa"
                score >= 90 -> "Condição excelente"
                stability < 0.55f -> "A compensar movimento…"
                luma < 58 -> "A preparar fotografia noturna…"
                else -> "A otimizar automaticamente…"
            }

            runOnUiThread {
                sceneText.text = scene
                scoreText.text = "Perfect Score: $score/100"
                statusText.text = hint
            }
            image.close()
        }

        provider.unbindAll()
        try {
            currentCamera = provider.bindToLifecycle(this, selector, preview, imageCapture, analysis)
            observeZoom()
        } catch (_: Exception) {
            provider.unbindAll()
            currentCamera = provider.bindToLifecycle(this, selector, preview, imageCapture)
            observeZoom()
            sceneText.text = "AUTO PERFECT · processamento Xiaomi"
            statusText.text = "HDR/Auto avançado ativo"
        }
    }

    private fun observeZoom() {
        currentCamera?.cameraInfo?.zoomState?.observe(this) { state ->
            currentZoom = state.zoomRatio
            updateZoomText(state.zoomRatio)
            zoom2Button.isEnabled = state.maxZoomRatio >= 2f
            zoom4Button.isEnabled = state.maxZoomRatio >= 4f
        }
    }

    private fun setZoom(requested: Float) {
        val camera = currentCamera ?: return
        val state = camera.cameraInfo.zoomState.value ?: return
        val zoom = requested.coerceIn(state.minZoomRatio, state.maxZoomRatio)
        currentZoom = zoom
        camera.cameraControl.setZoomRatio(zoom)
        updateZoomText(zoom)
    }

    private fun updateZoomText(zoom: Float) {
        zoomText.text = String.format(Locale.US, "%.1f×", zoom)
    }

    private fun updateSmartTorch(luma: Double) {
        val camera = currentCamera ?: return
        val hasFlash = camera.cameraInfo.hasFlashUnit()
        if (!hasFlash) return

        // Evita ligar a luz em zoom elevado: Lua, paisagem ou assunto distante.
        val nearSubjectLikely = currentZoom <= 1.6f

        if (luma < 24 && nearSubjectLikely) {
            darkFrames++
            brightFrames = 0
        } else if (luma > 42 || !nearSubjectLikely) {
            brightFrames++
            darkFrames = 0
        } else {
            darkFrames = 0
            brightFrames = 0
        }

        if (!torchEnabled && darkFrames >= 6) {
            torchEnabled = true
            camera.cameraControl.enableTorch(true)
        } else if (torchEnabled && brightFrames >= 4) {
            torchEnabled = false
            camera.cameraControl.enableTorch(false)
        }
    }

    private fun takePhoto() {
        val capture = imageCapture ?: return
        statusText.text = if (lastScore >= 85) "Perfeito · a captar…" else "A otimizar e captar…"

        val name = "AUTOPERFECT_" + SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(System.currentTimeMillis())
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/AutoPerfect")
        }
        val options = ImageCapture.OutputFileOptions.Builder(
            contentResolver,
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            values
        ).build()

        capture.takePicture(options, ContextCompat.getMainExecutor(this),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                    statusText.text = "Fotografia AUTO PERFECT guardada"
                    Toast.makeText(this@MainActivity, "Guardada em Pictures/AutoPerfect", Toast.LENGTH_SHORT).show()
                }

                override fun onError(exception: ImageCaptureException) {
                    statusText.text = "Erro na captura"
                    Toast.makeText(this@MainActivity, exception.message ?: "Erro de câmara", Toast.LENGTH_LONG).show()
                }
            })
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_GYROSCOPE) return
        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]
        val magnitude = sqrt(x * x + y * y + z * z)
        stability = (1f - magnitude / 2.6f).coerceIn(0f, 1f)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    override fun onDestroy() {
        currentCamera?.cameraControl?.enableTorch(false)
        cameraExecutor.shutdown()
        super.onDestroy()
    }
}
