const video = document.getElementById('camera-stream');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const cameraDataEl = document.getElementById('camera-data');
const tagDataEl = document.getElementById('tag-data');

// Especificaciones solicitadas
const TARGET_ID = 0;
const LOST_AFTER_MS = 600; // 0.6 segundos en milisegundos

let tagTracker = {}; 
let cameraInfo = {};
let detectorReady = false;
let apriltagDetector = null;
let detectionInProgress = false;

// 1. INICIALIZAR EL DETECTOR WEBASSEMBLY EN UN WEB WORKER
async function startDetector() {
    try {
        const Apriltag = Comlink.wrap(new Worker("apriltag.js"));
        apriltagDetector = await new Apriltag(Comlink.proxy(() => {
            detectorReady = true;
            console.log("Motor AprilTag WASM cargado y listo.");
        }));
    } catch (err) {
        console.error("No se pudo iniciar el detector:", err);
        tagDataEl.innerText = `Error al iniciar el detector: ${err.message || err}`;
    }
}

// Inicializar la cámara
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment", // Usar cámara trasera
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        video.srcObject = stream;

        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            extractCameraData(stream.getVideoTracks()[0]);
            
            requestAnimationFrame(processFrame);
        };
    } catch (err) {
        console.error("Error al acceder a la cámara: ", err);
        cameraDataEl.innerText = "Error al acceder a la cámara. Revisa los permisos.";
    }
}

function extractCameraData(track) {
    const settings = track.getSettings();
    const width = settings.width || video.videoWidth;
    const height = settings.height || video.videoHeight;
    const fps = settings.frameRate || 30;

    const cx = width / 2.0;
    const cy = height / 2.0;
    const fx = width * 0.8; 
    const fy = fx; 

    cameraInfo = { index: 0, width, height, fps, cx, cy, fx, fy };
    cameraDataEl.innerText = JSON.stringify(cameraInfo, null, 2);
}

// Bucle principal
async function processFrame() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Solo intentamos detectar si el motor ya se descargó y activó
    if (detectorReady && apriltagDetector && !detectionInProgress) {
        detectionInProgress = true;
        const width = canvas.width;
        const height = canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // Convertir la imagen a blanco y negro (Requisito del detector en C)
        const grayscale = new Uint8Array(width * height);
        for (let i = 0; i < grayscale.length; i++) {
            grayscale[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114);
        }
        
        try {
            // El detector asume por defecto la familia tag36h11
            const tags = await apriltagDetector.detect(grayscale, width, height);
            handleDetections(tags);
        } catch (e) {
            console.error("Fallo leyendo el tag:", e);
            tagDataEl.innerText = `Error del detector: ${e.message || e}`;
        } finally {
            detectionInProgress = false;
        }
    }

    checkLostTags();
    requestAnimationFrame(processFrame);
}

function handleDetections(tags) {
    const now = Date.now();

    tags.forEach(tag => {
        // Filtramos por el Robot Tag ID 0
        if (tag.id === TARGET_ID) {
            tagTracker[TARGET_ID] = now;
            
            drawTag(tag);
            tagDataEl.innerText = `Estado: Detectado\nÚltima vez visto: Ahora mismo\nCentro: x=${tag.center.x.toFixed(1)}, y=${tag.center.y.toFixed(1)}`;
        }
    });
}

function checkLostTags() {
    const now = Date.now();
    if (tagTracker[TARGET_ID]) {
        const timeSinceLastSeen = now - tagTracker[TARGET_ID];
        
        if (timeSinceLastSeen > LOST_AFTER_MS) {
            tagDataEl.innerText = `Estado: Perdido (Pasaron más de 0.6s)\nTiempo ausente: ${(timeSinceLastSeen / 1000).toFixed(2)}s`;
        }
    }
}

function drawTag(tag) {
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "lime";
    ctx.moveTo(tag.corners[0].x, tag.corners[0].y);
    ctx.lineTo(tag.corners[1].x, tag.corners[1].y);
    ctx.lineTo(tag.corners[2].x, tag.corners[2].y);
    ctx.lineTo(tag.corners[3].x, tag.corners[3].y);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "lime";
    ctx.font = "24px Arial";
    ctx.fillText(`ID: ${tag.id}`, tag.center.x - 20, tag.center.y);
}

// Iniciar todo
startDetector();
startCamera();
