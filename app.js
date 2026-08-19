const video = document.getElementById('camera-stream');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const cameraDataEl = document.getElementById('camera-data');
const tagDataEl = document.getElementById('tag-data');

// Especificaciones solicitadas
const TARGET_FAMILY = "tag36h11";
const TARGET_ID = 0;
const LOST_AFTER_MS = 600; // 0.6 segundos en milisegundos

let tagTracker = {}; // Para rastrear cuándo fue la última vez que vimos el tag
let cameraInfo = {};

// Inicializar la cámara
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment", // Usar cámara trasera en móviles
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        video.srcObject = stream;

        // Esperar a que el video empiece a reproducirse para obtener dimensiones reales
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            extractCameraData(stream.getVideoTracks()[0]);
            
            // Iniciar el ciclo de detección una vez que la cámara esté lista
            requestAnimationFrame(processFrame);
        };
    } catch (err) {
        console.error("Error al acceder a la cámara: ", err);
        cameraDataEl.innerText = "Error al acceder a la cámara. Revisa los permisos.";
    }
}

// Extraer configuración de la cámara y estimar intrínsecos
function extractCameraData(track) {
    const settings = track.getSettings();
    
    // Extraemos lo que la API nos da
    const width = settings.width || video.videoWidth;
    const height = settings.height || video.videoHeight;
    const fps = settings.frameRate || 30;

    // Estimamos los parámetros intrínsecos
    const cx = width / 2.0;
    const cy = height / 2.0;
    // Estimación estándar de focal length (fx, fy) asumiendo un FOV común
    const fx = width * 0.8; 
    const fy = fx; 

    cameraInfo = {
        index: 0,
        width: width,
        height: height,
        fps: fps,
        cx: cx,
        cy: cy,
        fx: fx,
        fy: fy
    };

    cameraDataEl.innerText = JSON.stringify(cameraInfo, null, 2);
}

// Bucle principal de procesamiento de imágenes
async function processFrame() {
    // 1. Dibujar el fotograma actual en el canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. Extraer datos de la imagen (escala de grises) para AprilTag
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Asegurarse de que la librería AprilTag esté cargada
    if (typeof AprilTag !== 'undefined') {
        // En un entorno real de producción, instanciarías el detector Wasm aquí.
        // Como las APIs de los wrappers JS varían, aquí se simula el llamado estándar:
        
        try {
            // Asumiendo inicialización de detector de la librería unpkg
            // (Revisa la documentación específica del wrapper Wasm si usas otro)
            const tags = await AprilTag.detect(imageData, {
                family: TARGET_FAMILY
            });

            handleDetections(tags);
        } catch (e) {
            // Ignorar errores de frame único
        }
    }

    // 3. Revisar si perdimos el tag de vista (más de 0.6s)
    checkLostTags();

    // 4. Pedir el siguiente fotograma
    requestAnimationFrame(processFrame);
}

function handleDetections(tags) {
    const now = Date.now();
    let foundTarget = false;

    tags.forEach(tag => {
        // Solo nos interesa el ID 0 de la familia 36h11
        if (tag.id === TARGET_ID) {
            foundTarget = true;
            // Actualizamos la última vez que lo vimos
            tagTracker[TARGET_ID] = now;
            
            // Dibujar un cuadro verde alrededor del tag
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

// Función auxiliar para dibujar un recuadro alrededor del Tag detectado
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

    // Dibujar el ID en el centro
    ctx.fillStyle = "lime";
    ctx.font = "24px Arial";
    ctx.fillText(`ID: ${tag.id}`, tag.center.x - 20, tag.center.y);
}

// Iniciar todo
startCamera();