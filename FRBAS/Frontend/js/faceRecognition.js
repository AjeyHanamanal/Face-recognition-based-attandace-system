// Global variables
let isModelLoaded = false;
let video;
let canvas;
let ctx;
let faceDescriptors = [];
let recognizedStudents = new Set();
let currentSession = null;
let recognitionInterval;
let studentRecognitionCounter = {};
let isStreamStarted = false; // Track if camera stream is started
let isProcessingFrame = false; // Prevent concurrent frame processing

// Initialize face recognition
async function initFaceRecognition() {
    try {
        // Load models
        await loadModels();

        // Initialize video and canvas
        video = document.getElementById('video');
        canvas = document.getElementById('overlay');
        ctx = canvas.getContext('2d');

        // Resize canvas to match video dimensions (initial, might be updated later)
        canvas.width = video.width; // Or a default width, if video width is not immediately available
        canvas.height = video.height; // Or a default height

        // Load existing students' face data
        await loadStudentFaceData();

        console.log('Face recognition initialization complete');
        updateStatus('Face recognition system initialized');
        document.getElementById('toggleCamera').disabled = false; // Enable camera button after init
    } catch (error) {
        console.error('Error initializing face recognition:', error);
        updateStatus('Error initializing face recognition system');
    }
}

// Load the required face-api.js models
async function loadModels() {
    try {
        updateStatus('Loading face recognition models...');
        console.log('Starting to load face-api.js models...');

        // Try different model sources
        const modelOptions = [
            'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/',
            'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/',
            'https://justadudewhohacks.github.io/face-api.js/models/'
        ];

        let loaded = false;
        let lastError = null;

        // Try each model source until one works
        for (const modelUrl of modelOptions) {
            if (loaded) break;

            try {
                console.log(`Trying to load models from: ${modelUrl}`);

                // Load models one by one (more reliable than Promise.all)
                // console.log('Loading TinyFaceDetector model...');
                await faceapi.nets.tinyFaceDetector.load(modelUrl);
                console.log('TinyFaceDetector loaded successfully');

                // **Add this line to load ssdMobilenetv1 model:**
                // console.log('Loading SsdMobilenetv1 model...');
                await faceapi.nets.ssdMobilenetv1.load(modelUrl);
                console.log('SsdMobilenetv1 loaded successfully');

                // console.log('Loading FaceLandmarkModel...');
                await faceapi.nets.faceLandmark68Net.load(modelUrl);
                console.log('FaceLandmarkModel loaded successfully');

                // console.log('Loading FaceRecognitionModel...');
                await faceapi.nets.faceRecognitionNet.load(modelUrl);
                console.log('FaceRecognitionModel loaded successfully');

                loaded = true;
                console.log('All models loaded successfully!');
            } catch (error) {
                console.log(`Failed to load from ${modelUrl}: ${error.message}`);
                lastError = error;
            }
        }

        if (!loaded) {
            throw lastError || new Error('Failed to load models from all sources');
        }

        isModelLoaded = true;
        updateStatus('Face recognition models loaded');
    } catch (error) {
        console.error('Error loading models: ' + error.message);
        updateStatus(`Error loading models: ${error.message}`);
        throw error;
    }
}


// Load existing students' face data from the server
async function loadStudentFaceData() {
    try {
        const response = await fetch('/api/students');
        const students = await response.json();

        faceDescriptors = []; // Clear existing descriptors
        // Store face descriptors with student info
        for (const student of students) {
            const detailsResponse = await fetch(`/api/students/${student.USN}`);
            const studentDetails = await detailsResponse.json();

            // Create face descriptor from stored data
            if (studentDetails.FaceData) {
                faceDescriptors.push({
                    usn: studentDetails.USN,
                    name: studentDetails.Name,
                    descriptor: new Float32Array(studentDetails.FaceData)
                });
            }
        }

        updateStatus(`Loaded ${faceDescriptors.length} student face profiles`);
    } catch (error) {
        console.error('Error loading student face data:', error);
        updateStatus('Failed to load student face data');
    }
}

// Toggle camera on/off
async function toggleCamera() {
    if (!isStreamStarted) {
        await startCamera();
    } else {
        stopCamera();
    }
}


// Start the camera for face recognition
async function startCamera() {
    if (!isModelLoaded) {
        await initFaceRecognition(); // Ensure models are loaded if not already
        if (!isModelLoaded) { // If models still not loaded, exit
            return;
        }
    }

    try {
        updateStatus('Starting camera...');
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' }
        });
        video.srcObject = stream;

        video.onloadedmetadata = () => {
            // Resize canvas after video metadata is loaded to get correct video dimensions
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        };


        // Start recognition process after video starts playing
        video.play().then(() => {
            recognitionInterval = setInterval(recognizeFaces, 1000);
            updateStatus('Camera started. Recognizing faces...');
            isStreamStarted = true;
            document.getElementById('toggleCamera').textContent = 'Stop Camera'; // Update button text
        }).catch(error => {
            console.error('Error playing video:', error);
            stopCamera(); // Attempt to stop if play fails
            updateStatus('Error starting video stream.');
            isStreamStarted = false;
            document.getElementById('toggleCamera').textContent = 'Start Camera';
        });


    } catch (error) {
        console.error('Error accessing camera:', error);
        updateStatus('Failed to access camera. Please check permissions.');
        isStreamStarted = false;
        document.getElementById('toggleCamera').textContent = 'Start Camera';
    }
}


// Stop the camera and recognition process
function stopCamera() {
    updateStatus('Stopping camera...');
    if (video && video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }

    // Clear recognition interval
    if (recognitionInterval) {
        clearInterval(recognitionInterval);
        recognitionInterval = null;
    }

    // Clear canvas
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    updateStatus('Camera stopped');
    isStreamStarted = false;
    document.getElementById('toggleCamera').textContent = 'Start Camera'; // Update button text
}


// Recognize faces in the video feed
async function recognizeFaces() {
    if (!video || !video.srcObject || !currentSession || isProcessingFrame) return;

    isProcessingFrame = true; // Set processing flag

    try {
        // Get the dimensions of the video for accurate overlay
        const displaySize = { width: video.videoWidth, height: video.videoHeight };
        faceapi.matchDimensions(canvas, displaySize);


        // Detect faces with landmarks and descriptors
        const detections = await faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })) // Using TinyFaceDetector for efficiency
            .withFaceLandmarks()
            .withFaceDescriptors();

        // Resize detections to match canvas size
        const resizedDetections = faceapi.resizeResults(detections, displaySize);


        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);


        if (resizedDetections.length > 0) {
            updateStatus('Recognizing faces...');
            for (const detection of resizedDetections) {
                const faceDescriptor = detection.descriptor;
                let match = null;
                let minDistance = 0.6; // Threshold for face matching

                // Find matching student
                for (const student of faceDescriptors) {
                    if (student.descriptor) { // Ensure descriptor is not null
                        const distance = faceapi.euclideanDistance(faceDescriptor, student.descriptor);

                        if (distance < minDistance) {
                            minDistance = distance;
                            match = student;
                        }
                    }
                }


                if (match) {
                    // Draw recognized face with name
                    const box = detection.detection.box;
                    const drawBox = new faceapi.draw.DrawBox(box, {
                        label: `${match.name} (${match.usn})`,
                        boxColor: 'green' // Indicate recognized face
                    });
                    drawBox.draw(canvas);
                    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections, { color: 'green' }); // Draw landmarks in green


                    // Increment recognition counter
                    studentRecognitionCounter[match.usn] = (studentRecognitionCounter[match.usn] || 0) + 1;

                    // Mark attendance after consecutive recognitions (e.g., 3 frames)
                    if (studentRecognitionCounter[match.usn] >= 3 && !recognizedStudents.has(match.usn)) {
                        await markAttendance(match.usn);
                        recognizedStudents.add(match.usn);
                        updateRecognizedList(match);
                        studentRecognitionCounter[match.usn] = 0; // Reset counter after marking attendance
                    }
                } else {
                    // Draw unrecognized face
                    const box = detection.detection.box;
                    const drawBox = new faceapi.draw.DrawBox(box, {
                        label: 'Unknown',
                        boxColor: 'red' // Indicate unrecognized face
                    });
                    drawBox.draw(canvas);
                    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections, { color: 'red' }); // Draw landmarks in red
                }
            }
            updateStatus(`Scanning... ${recognizedStudents.size} students recognized`);

        } else {
            updateStatus('No faces detected');
        }


    } catch (error) {
        console.error('Error during face recognition:', error);
        updateStatus('Error during face recognition');
    } finally {
        isProcessingFrame = false; // Reset processing flag
    }
}


// Mark attendance for a recognized student (remains the same)
async function markAttendance(usn) {
    try {
        const response = await fetch('/api/attendance/mark', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: currentSession,
                usn: usn,
                status: 'Present'
            })
        });

        if (response.ok) {
            console.log(`Attendance marked for student ${usn}`);
            updateAttendanceSummary();
        } else {
            console.error('Failed to mark attendance');
        }
    } catch (error) {
        console.error('Error marking attendance:', error);
    }
}

// Update the attendance summary (remains the same)
async function updateAttendanceSummary() {
    if (!currentSession) return;

    try {
        const response = await fetch(`/api/attendance/summary/${currentSession}`);
        const summary = await response.json();

        document.getElementById('present-count').textContent = summary.present_count || 0;
        document.getElementById('total-count').textContent = summary.total_students || 0;
    } catch (error) {
        console.error('Error updating attendance summary:', error);
    }
}

// Update the recognized students list (remains the same)
function updateRecognizedList(student) {
    const list = document.getElementById('recognized-list');
    const listItem = document.createElement('li');
    listItem.textContent = `${student.name} (${student.usn})`;
    list.appendChild(listItem);
}

// Update status message (remains the same)
function updateStatus(message) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

// Export functions for use in other scripts (remains the same)
window.faceRecognition = {
    initFaceRecognition,
    startCamera: toggleCamera, // Use toggleCamera for start/stop
    stopCamera,
    setCurrentSession: (sessionId) => {
        currentSession = sessionId;
        recognizedStudents.clear();
        studentRecognitionCounter = {};
        document.getElementById('current-session').textContent = sessionId;
        document.getElementById('recognized-list').innerHTML = '';
    }
};

// Initialize face recognition when script loads
initFaceRecognition();

// Event listener for the toggle camera button
document.addEventListener('DOMContentLoaded', () => {
    const toggleCameraButton = document.getElementById('toggleCamera');
    if (toggleCameraButton) {
        toggleCameraButton.addEventListener('click', window.faceRecognition.startCamera); // Use exported toggleCamera function
        toggleCameraButton.disabled = true; // Disable initially, enable after model load in initFaceRecognition
    }
});