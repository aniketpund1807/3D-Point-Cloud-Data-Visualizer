// Main Point Cloud Visualizer Class with Improved Tile System
class PointCloudVisualizer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.plyFiles = [];
        this.fileCoordinates = new Map();
        this.tileGrid = new Map();
        this.currentTile = { x: 0, y: 0 };
        this.tileSize = 50;

        // Grid bounds
        this.minX = 0;
        this.maxX = 0;
        this.minY = 0;
        this.maxY = 0;

        this.loadedPointClouds = new Map();
        this.currentPointClouds = [];

        // New properties for improved tile management
        this.initialTileFiles = new Map(); // Store which files are loaded in initial tiles
        this.allTileFiles = new Map(); // Store all files for each tile
        this.initialTilesLoaded = false;

        this.init();
        this.setupEventListeners();
    }

    init() {
        try {
            // Create clean scene with no helpers
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x1a1a1a);

            const canvasContainer = document.getElementById('canvasContainer');
            const width = canvasContainer.clientWidth;
            const height = canvasContainer.clientHeight;

            // Improved camera setup to fit template page
            this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
            this.camera.position.set(0, 0, 80); // Adjusted initial position

            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: false
            });
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
            this.renderer.setClearColor(0x1a1a1a, 1);

            canvasContainer.appendChild(this.renderer.domElement);

            // Improved orbit controls
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.screenSpacePanning = true;
            this.controls.minDistance = 5;
            this.controls.maxDistance = 500;

            const ambientLight = new THREE.AmbientLight(0x404040, 2);
            this.scene.add(ambientLight);

            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(50, 50, 50);
            this.scene.add(directionalLight);

            this.animate();
            window.addEventListener('resize', () => this.onWindowResize());

            console.log('Three.js initialized successfully - Improved Tile System Ready');
        } catch (error) {
            console.error('Error initializing Three.js:', error);
            alert('Error initializing 3D viewer. Please check console for details.');
        }
    }

    setupEventListeners() {
        document.getElementById('loadButton').addEventListener('click', () => {
            document.getElementById('folderInput').click();
        });

        document.getElementById('folderInput').addEventListener('change', (event) => {
            this.handleFolderSelection(event);
        });

        document.getElementById('leftBtn').addEventListener('click', () => this.navigate('left'));
        document.getElementById('rightBtn').addEventListener('click', () => this.navigate('right'));
        document.getElementById('upBtn').addEventListener('click', () => this.navigate('up'));
        document.getElementById('downBtn').addEventListener('click', () => this.navigate('down'));
    }

    async handleFolderSelection(event) {
        const files = Array.from(event.target.files).filter(file => file.name.toLowerCase().endsWith('.ply'));

        if (files.length === 0) {
            alert('No .ply files found in the selected folder.');
            return;
        }

        this.plyFiles = files;
        this.initialTilesLoaded = false;

        const fileInfo = document.getElementById('fileInfo');
        fileInfo.innerHTML = `<span class="loading"></span>Analyzing point cloud coordinates...`;

        await this.analyzeAllFiles();
        this.calculateGridOrganization();
        await this.loadInitialTiles();

        fileInfo.textContent = `Loaded ${this.plyFiles.length} files. Initial 3x3 tiles loaded. Current tile: (${this.currentTile.x}, ${this.currentTile.y})`;
    }

    async analyzeAllFiles() {
        this.fileCoordinates.clear();

        for (const file of this.plyFiles) {
            try {
                const coordinates = await this.extractCoordinatesFromFile(file);
                this.fileCoordinates.set(file.name, coordinates);
            } catch (error) {
                console.error(`Error analyzing file ${file.name}:`, error);
            }
        }
    }

    extractCoordinatesFromFile(file) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.PLYLoader();

            loader.load(
                URL.createObjectURL(file),
                (geometry) => {
                    geometry.computeBoundingBox();
                    const bbox = geometry.boundingBox;

                    const centerX = (bbox.max.x + bbox.min.x) / 2;
                    const centerY = (bbox.max.y + bbox.min.y) / 2;
                    const centerZ = (bbox.max.z + bbox.min.z) / 2;

                    const extentX = bbox.max.x - bbox.min.x;
                    const extentY = bbox.max.y - bbox.min.y;
                    const extentZ = bbox.max.z - bbox.min.z;

                    resolve({
                        centerX,
                        centerY,
                        centerZ,
                        extentX,
                        extentY,
                        extentZ,
                        minX: bbox.min.x,
                        maxX: bbox.max.x,
                        minY: bbox.min.y,
                        maxY: bbox.max.y,
                        minZ: bbox.min.z,
                        maxZ: bbox.max.z
                    });
                },
                undefined,
                (error) => {
                    reject(error);
                }
            );
        });
    }

    calculateGridOrganization() {
        if (this.fileCoordinates.size === 0) return;

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const coords of this.fileCoordinates.values()) {
            minX = Math.min(minX, coords.minX);
            maxX = Math.max(maxX, coords.maxX);
            minY = Math.min(minY, coords.minY);
            maxY = Math.max(maxY, coords.maxY);
        }

        this.minX = minX;
        this.maxX = maxX;
        this.minY = minY;
        this.maxY = maxY;

        let totalExtentX = 0;
        let totalExtentY = 0;
        let fileCount = 0;

        for (const coords of this.fileCoordinates.values()) {
            totalExtentX += coords.extentX;
            totalExtentY += coords.extentY;
            fileCount++;
        }

        const avgExtentX = totalExtentX / fileCount;
        const avgExtentY = totalExtentY / fileCount;
        this.tileSize = Math.max(avgExtentX, avgExtentY) * 1.2;

        this.organizeFilesIntoTiles();
    }

    organizeFilesIntoTiles() {
        this.tileGrid.clear();
        this.allTileFiles.clear();

        // First, organize all files into tiles
        for (const [filename, coords] of this.fileCoordinates) {
            const tileX = Math.floor((coords.centerX - this.minX) / this.tileSize);
            const tileY = Math.floor((coords.centerY - this.minY) / this.tileSize);

            const tileKey = `${tileX},${tileY}`;
            const file = this.plyFiles.find(f => f.name === filename);

            if (file) {
                if (!this.allTileFiles.has(tileKey)) {
                    this.allTileFiles.set(tileKey, []);
                }
                this.allTileFiles.get(tileKey).push({
                    file: file,
                    originalCoords: coords,
                    tileX: tileX,
                    tileY: tileY
                });
            }
        }

        // Find center tile for initial view
        const totalTilesX = Math.ceil((this.maxX - this.minX) / this.tileSize);
        const totalTilesY = Math.ceil((this.maxY - this.minY) / this.tileSize);

        this.currentTile = {
            x: Math.floor(totalTilesX / 2),
            y: Math.floor(totalTilesY / 2)
        };

        console.log(`Organized ${this.plyFiles.length} files into ${this.allTileFiles.size} tiles`);
        console.log(`Grid size: ${totalTilesX}x${totalTilesY} tiles`);
        console.log(`Initial tile: (${this.currentTile.x}, ${this.currentTile.y})`);
    }

    async loadInitialTiles() {
        this.clearCurrentPointClouds();
        this.initialTileFiles.clear();

        // Load 3x3 grid around center tile (like in your image)
        const centerX = this.currentTile.x;
        const centerY = this.currentTile.y;

        console.log('Loading initial 3x3 tiles around center:', centerX, centerY);

        // Load tiles in 3x3 grid pattern
        for (let x = centerX - 1; x <= centerX + 1; x++) {
            for (let y = centerY - 1; y <= centerY + 1; y++) {
                const tileKey = `${x},${y}`;
                const allFiles = this.allTileFiles.get(tileKey) || [];

                if (allFiles.length > 0) {
                    // For initial load, take only the first file from each tile
                    const firstFile = allFiles[0];
                    this.initialTileFiles.set(tileKey, [firstFile]);

                    await this.loadFileForTile(firstFile);
                    console.log(`Loaded initial file for tile (${x}, ${y}): ${firstFile.file.name}`);
                }
            }
        }

        this.initialTilesLoaded = true;
        this.focusOnCurrentTile();
    }

    async loadCurrentTile() {
        this.clearCurrentPointClouds();

        const tileKey = `${this.currentTile.x},${this.currentTile.y}`;
        let filesToLoad = [];

        if (this.initialTilesLoaded) {
            // After initial load, load ALL files for the current tile
            filesToLoad = this.allTileFiles.get(tileKey) || [];
            console.log(`Loading ALL ${filesToLoad.length} files for tile ${tileKey}`);
        } else {
            // During initial load, load only first file
            filesToLoad = this.initialTileFiles.get(tileKey) || [];
            console.log(`Loading initial file for tile ${tileKey}`);
        }

        for (const tileFile of filesToLoad) {
            await this.loadFileForTile(tileFile);
        }

        this.focusOnCurrentTile();
    }

    async loadFileForTile(tileFile) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.PLYLoader();

            loader.load(
                URL.createObjectURL(tileFile.file),
                (geometry) => {
                    const material = new THREE.PointsMaterial({
                        size: 0.1,
                        vertexColors: true,
                        sizeAttenuation: true
                    });

                    const points = new THREE.Points(geometry, material);

                    this.loadedPointClouds.set(tileFile.file.name, points);
                    this.currentPointClouds.push(points);
                    this.scene.add(points);

                    resolve(points);
                },
                undefined,
                (error) => {
                    console.error(`Error loading file ${tileFile.file.name}:`, error);
                    reject(error);
                }
            );
        });
    }

    focusOnCurrentTile() {
        const worldX = this.minX + (this.currentTile.x + 0.5) * this.tileSize;
        const worldY = this.minY + (this.currentTile.y + 0.5) * this.tileSize;

        // Improved camera positioning to fit template
        this.controls.target.set(worldX, worldY, 0);

        // Calculate optimal camera distance based on tile size
        const optimalDistance = this.tileSize * 1.5;
        this.camera.position.set(worldX, worldY, optimalDistance);

        this.controls.update();

        // Reset camera to ensure proper view
        this.camera.lookAt(worldX, worldY, 0);
    }

    navigate(direction) {
        if (this.allTileFiles.size === 0) {
            alert('Please load PLY files first!');
            return;
        }

        let newTileX = this.currentTile.x;
        let newTileY = this.currentTile.y;

        switch (direction) {
            case 'left':
                newTileX--;
                break;
            case 'right':
                newTileX++;
                break;
            case 'up':
                newTileY++;
                break;
            case 'down':
                newTileY--;
                break;
        }

        const newTileKey = `${newTileX},${newTileY}`;
        if (this.allTileFiles.has(newTileKey) || this.isValidTilePosition(newTileX, newTileY)) {
            this.currentTile = { x: newTileX, y: newTileY };
            this.loadCurrentTile();

            const tileFiles = this.allTileFiles.get(newTileKey) || [];
            const loadedFiles = this.initialTilesLoaded ? tileFiles.length :
                               (this.initialTileFiles.get(newTileKey) || []).length;

            document.getElementById('fileInfo').textContent =
                `Current tile: (${newTileX}, ${newTileY}) - ${loadedFiles} files loaded`;
        } else {
            console.log(`Tile (${newTileX}, ${newTileY}) is empty or out of bounds`);
        }
    }

    isValidTilePosition(tileX, tileY) {
        const totalTilesX = Math.ceil((this.maxX - this.minX) / this.tileSize);
        const totalTilesY = Math.ceil((this.maxY - this.minY) / this.tileSize);

        return tileX >= 0 && tileX < totalTilesX && tileY >= 0 && tileY < totalTilesY;
    }

    clearCurrentPointClouds() {
        for (const pointCloud of this.currentPointClouds) {
            this.scene.remove(pointCloud);
            if (pointCloud.geometry) pointCloud.geometry.dispose();
            if (pointCloud.material) pointCloud.material.dispose();
        }
        this.currentPointClouds = [];
    }

    clearAllPointClouds() {
        this.clearCurrentPointClouds();
        this.loadedPointClouds.clear();
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

    removeVisualHelpers() {
        this.scene.traverse((child) => {
            if (child instanceof THREE.GridHelper || child instanceof THREE.AxesHelper) {
                this.scene.remove(child);
            }
        });
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    if (typeof THREE === 'undefined') {
        console.error('THREE is not defined. Please check Three.js loading.');
        alert('Error: Three.js library failed to load. Please check your internet connection.');
        return;
    }

    if (typeof THREE.PLYLoader === 'undefined') {
        console.error('PLYLoader is not defined. Please check PLYLoader loading.');
        alert('Error: PLYLoader failed to load. Please check console for details.');
        return;
    }

    const visualizer = new PointCloudVisualizer();

    setTimeout(() => {
        visualizer.removeVisualHelpers();
    }, 100);

    console.log('Improved Tile Point Cloud Visualizer initialized');
});