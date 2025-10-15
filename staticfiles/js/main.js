// Main Point Cloud Visualizer Class
class PointCloudVisualizer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.plyFiles = [];
        this.currentFileIndex = 0;
        this.loadedPointClouds = new Map();
        this.currentPointCloud = null;
        this.adjacentPointCloud = null;

        this.mergeDistance = 15;

        this.init();
        this.setupEventListeners();
    }

    init() {
        try {
            // Create scene
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x1a1a1a);

            // Get canvas container dimensions
            const canvasContainer = document.getElementById('canvasContainer');
            const width = canvasContainer.clientWidth;
            const height = canvasContainer.clientHeight;

            // Create camera
            this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
            this.camera.position.set(0, 0, 50);

            // Create renderer
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(window.devicePixelRatio);

            canvasContainer.appendChild(this.renderer.domElement);

            // Add orbit controls
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;

            // Add lights
            const ambientLight = new THREE.AmbientLight(0x404040, 2);
            this.scene.add(ambientLight);

            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(50, 50, 50);
            this.scene.add(directionalLight);

            // // Add grid helper
            // const gridHelper = new THREE.GridHelper(100, 20);
            // this.scene.add(gridHelper);

            // // Add axes helper
            // const axesHelper = new THREE.AxesHelper(20);
            // this.scene.add(axesHelper);

            // Start animation loop
            this.animate();

            // Handle window resize
            window.addEventListener('resize', () => this.onWindowResize());

            console.log('Three.js initialized successfully');
        } catch (error) {
            console.error('Error initializing Three.js:', error);
            alert('Error initializing 3D viewer. Please check console for details.');
        }
    }

    setupEventListeners() {
        // Load button click
        document.getElementById('loadButton').addEventListener('click', () => {
            document.getElementById('folderInput').click();
        });

        // Folder input change
        document.getElementById('folderInput').addEventListener('change', (event) => {
            this.handleFolderSelection(event);
        });

        // Navigation buttons
        document.getElementById('leftBtn').addEventListener('click', () => this.navigate('left'));
        document.getElementById('rightBtn').addEventListener('click', () => this.navigate('right'));
        document.getElementById('upBtn').addEventListener('click', () => this.navigate('up'));
        document.getElementById('downBtn').addEventListener('click', () => this.navigate('down'));
        document.getElementById('forwardBtn').addEventListener('click', () => this.navigate('forward'));
        document.getElementById('backwardBtn').addEventListener('click', () => this.navigate('backward'));
    }

    handleFolderSelection(event) {
        const files = Array.from(event.target.files).filter(file => file.name.toLowerCase().endsWith('.ply'));

        if (files.length === 0) {
            alert('No .ply files found in the selected folder.');
            return;
        }

        this.plyFiles = files.sort((a, b) => a.name.localeCompare(b.name));
        this.currentFileIndex = 0;

        // Update file info
        document.getElementById('fileInfo').textContent =
            `Loaded ${this.plyFiles.length} files. Current: ${this.plyFiles[0].name}`;

        // Clear previous point clouds
        this.clearAllPointClouds();

        // Load and visualize first file
        this.loadAndVisualizeFile(this.plyFiles[0], 0, 0, 0);
    }

    clearAllPointClouds() {
        // Remove all point clouds from scene
        for (let i = this.scene.children.length - 1; i >= 0; i--) {
            const child = this.scene.children[i];
            if (child instanceof THREE.Points) {
                this.scene.remove(child);
            }
        }

        this.loadedPointClouds.clear();
        this.currentPointCloud = null;
        this.adjacentPointCloud = null;
    }

    async loadAndVisualizeFile(file, offsetX = 0, offsetY = 0, offsetZ = 0) {
        return new Promise((resolve, reject) => {
            try {
                const loader = new THREE.PLYLoader();

                loader.load(
                    URL.createObjectURL(file),
                    (geometry) => {
                        // Center geometry
                        geometry.computeBoundingBox();
                        const center = new THREE.Vector3();
                        geometry.boundingBox.getCenter(center);
                        geometry.translate(-center.x + offsetX, -center.y + offsetY, -center.z + offsetZ);

                        // Create material with vertex colors
                        const material = new THREE.PointsMaterial({
                            size: 0.1,
                            vertexColors: true,
                            sizeAttenuation: true
                        });

                        // Create points
                        const points = new THREE.Points(geometry, material);

                        // Store point cloud with metadata
                        this.loadedPointClouds.set(file.name, {
                            points: points,
                            geometry: geometry,
                            offset: { x: offsetX, y: offsetY, z: offsetZ }
                        });

                        // Add to scene
                        this.scene.add(points);

                        // Set as current or adjacent point cloud
                        if (offsetX === 0 && offsetY === 0 && offsetZ === 0) {
                            this.currentPointCloud = { name: file.name, points: points };
                        } else {
                            this.adjacentPointCloud = { name: file.name, points: points };
                        }

                        // Update camera to look at the new point cloud
                        this.controls.target.set(offsetX, offsetY, offsetZ);
                        this.controls.update();

                        console.log(`Loaded: ${file.name} at (${offsetX}, ${offsetY}, ${offsetZ})`);
                        resolve(points);
                    },
                    // Progress callback
                    (progress) => {
                        const percent = (progress.loaded / progress.total * 100).toFixed(1);
                        console.log(`Loading ${file.name}: ${percent}%`);
                    },
                    // Error callback
                    (error) => {
                        console.error('Error loading PLY file:', error);
                        reject(error);
                    }
                );
            } catch (error) {
                console.error('Error in loadAndVisualizeFile:', error);
                reject(error);
            }
        });
    }

    navigate(direction) {
        if (this.plyFiles.length === 0) {
            alert('Please load PLY files first!');
            return;
        }

        let offsetX = 0, offsetY = 0, offsetZ = 0;
        let nextIndex = this.currentFileIndex;

        // Calculate offset and next index based on direction
        switch (direction) {
            case 'right':
                offsetX = this.mergeDistance;
                nextIndex = (this.currentFileIndex + 1) % this.plyFiles.length;
                break;
            case 'left':
                offsetX = -this.mergeDistance;
                nextIndex = (this.currentFileIndex - 1 + this.plyFiles.length) % this.plyFiles.length;
                break;
            case 'up':
                offsetY = this.mergeDistance;
                nextIndex = (this.currentFileIndex + 1) % this.plyFiles.length;
                break;
            case 'down':
                offsetY = -this.mergeDistance;
                nextIndex = (this.currentFileIndex - 1 + this.plyFiles.length) % this.plyFiles.length;
                break;
            case 'forward':
                offsetZ = this.mergeDistance;
                nextIndex = (this.currentFileIndex + 1) % this.plyFiles.length;
                break;
            case 'backward':
                offsetZ = -this.mergeDistance;
                nextIndex = (this.currentFileIndex - 1 + this.plyFiles.length) % this.plyFiles.length;
                break;
        }

        // Remove previous adjacent point cloud if exists
        if (this.adjacentPointCloud) {
            this.scene.remove(this.adjacentPointCloud.points);
            this.loadedPointClouds.delete(this.adjacentPointCloud.name);
            this.adjacentPointCloud = null;
        }

        // Show loading state
        const fileInfo = document.getElementById('fileInfo');
        fileInfo.innerHTML = `<span class="loading"></span>Loading adjacent file...`;

        // Load and visualize adjacent file
        this.loadAndVisualizeFile(this.plyFiles[nextIndex], offsetX, offsetY, offsetZ)
            .then(() => {
                this.currentFileIndex = nextIndex;
                fileInfo.textContent =
                    `Current: ${this.plyFiles[this.currentFileIndex].name} (${this.currentFileIndex + 1}/${this.plyFiles.length})`;
            })
            .catch(error => {
                console.error('Error loading adjacent file:', error);
                fileInfo.textContent = 'Error loading file! Please check console.';
            });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.controls) {
            this.controls.update();
        }
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    onWindowResize() {
        const canvasContainer = document.getElementById('canvasContainer');
        const width = canvasContainer.clientWidth;
        const height = canvasContainer.clientHeight;

        if (this.camera && this.renderer) {
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        }
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if THREE is available
    if (typeof THREE === 'undefined') {
        console.error('THREE is not defined. Please check Three.js loading.');
        alert('Error: Three.js library failed to load. Please check your internet connection.');
        return;
    }

    // Check if PLYLoader is available
    if (typeof THREE.PLYLoader === 'undefined') {
        console.error('PLYLoader is not defined. Please check PLYLoader loading.');
        alert('Error: PLYLoader failed to load. Please check console for details.');
        return;
    }

    // Initialize the visualizer
    new PointCloudVisualizer();
    console.log('Point Cloud Visualizer initialized');
});