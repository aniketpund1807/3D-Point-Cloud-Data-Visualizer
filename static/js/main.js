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
            this.camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 10000);
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

        fileInfo.textContent = `Loaded ${this.plyFiles.length} files. Current tile: (${this.currentTile.x}, ${this.currentTile.y})`;
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
        this.tileSize = Math.max(avgExtentX, avgExtentY) * 2.0; // Increased to ensure separation

        this.organizeFilesIntoTiles();
    }

    organizeFilesIntoTiles() {
        this.tileGrid.clear();
        this.allTileFiles.clear();

        // Create fixed 3x3 tile grid (9 tiles total)
        const totalTilesX = 3;
        const totalTilesY = 3;

        console.log(`Creating fixed 3x3 tile grid: ${totalTilesX}x${totalTilesY} tiles`);

        // Initialize all 9 tiles
        for (let x = 0; x < totalTilesX; x++) {
            for (let y = 0; y < totalTilesY; y++) {
                const tileKey = `${x},${y}`;
                this.allTileFiles.set(tileKey, []);
            }
        }

        // Get first 9 files (one for each tile)
        const filesToUse = this.plyFiles.slice(0, 9);
        
        if (filesToUse.length < 9) {
            console.warn(`Only ${filesToUse.length} files available, but 9 tiles needed`);
        }

        // Assign exactly one file to each tile in order
        let fileIndex = 0;
        for (let x = 0; x < totalTilesX; x++) {
            for (let y = 0; y < totalTilesY; y++) {
                if (fileIndex < filesToUse.length) {
                    const file = filesToUse[fileIndex];
                    const coords = this.fileCoordinates.get(file.name);
                    const tileKey = `${x},${y}`;

                    if (coords) {
                        this.allTileFiles.set(tileKey, [{
                            file: file,
                            originalCoords: coords,
                            tileX: x,
                            tileY: y
                        }]);
                        console.log(`Assigned file ${file.name} to tile (${x}, ${y})`);
                    } else {
                        console.warn(`No coordinates found for file: ${file.name}`);
                    }
                    fileIndex++;
                }
            }
        }

        // Set center tile for initial view
        this.currentTile = {
            x: 1, // Center of 3x3 grid
            y: 1  // Center of 3x3 grid
        };

        console.log(`Organized ${Math.min(filesToUse.length, 9)} files into 9 tiles (3x3 grid)`);
        console.log(`Fixed grid size: ${totalTilesX}x${totalTilesY} tiles`);
        console.log(`Initial tile: (${this.currentTile.x}, ${this.currentTile.y})`);
    }

    async loadInitialTiles() {
        this.clearCurrentPointClouds();
        this.initialTileFiles.clear();

        // Load ONLY the center tile initially (not all 9 tiles)
        const centerX = this.currentTile.x;
        const centerY = this.currentTile.y;

        console.log('Loading initial center tile:', centerX, centerY);

        const tileKey = `${centerX},${centerY}`;
        const tileFiles = this.allTileFiles.get(tileKey);
        
        if (tileFiles && tileFiles.length > 0) {
            // Load only the center tile file
            const tileFile = tileFiles[0];
            this.initialTileFiles.set(tileKey, [tileFile]);
            await this.loadFileForTile(tileFile);
            console.log(`Loaded file for center tile (${centerX}, ${centerY}): ${tileFile.file.name}`);
        }

        this.initialTilesLoaded = true;
        this.focusOnCurrentTile();
    }

    async loadCurrentTile() {
        this.clearCurrentPointClouds();

        const tileKey = `${this.currentTile.x},${this.currentTile.y}`;
        const filesToLoad = this.allTileFiles.get(tileKey) || [];

        console.log(`Loading file for tile ${tileKey}`);

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
                    // Center the geometry at origin for better visualization
                    geometry.computeBoundingBox();
                    const bbox = geometry.boundingBox;
                    const center = new THREE.Vector3();
                    bbox.getCenter(center);
                    geometry.translate(-center.x, -center.y, -center.z);

                    const material = new THREE.PointsMaterial({
                        size: 0.05, // Reduced point size for better visualization
                        vertexColors: true,
                        sizeAttenuation: true
                    });

                    const points = new THREE.Points(geometry, material);

                    // Position the point cloud based on tile coordinates
                    const offsetX = (tileFile.tileX - 1) * this.tileSize;
                    const offsetY = (tileFile.tileY - 1) * this.tileSize;
                    points.position.set(offsetX, offsetY, 0);

                    this.loadedPointClouds.set(tileFile.file.name, points);
                    this.currentPointClouds.push(points);
                    this.scene.add(points);

                    console.log(`Visualized file: ${tileFile.file.name} at position (${offsetX}, ${offsetY}, 0)`);
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
        const offsetX = (this.currentTile.x - 1) * this.tileSize;
        const offsetY = (this.currentTile.y - 1) * this.tileSize;

        // Improved camera positioning
        this.controls.target.set(offsetX, offsetY, 0);

        // Calculate optimal camera distance based on tile size
        const optimalDistance = this.tileSize * 2.0;
        this.camera.position.set(offsetX, offsetY, optimalDistance);

        this.controls.update();

        // Reset camera to ensure proper view
        this.camera.lookAt(offsetX, offsetY, 0);

        console.log(`Focused on tile (${this.currentTile.x}, ${this.currentTile.y}) at position (${offsetX}, ${offsetY}, 0)`);
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

        // Check if new tile position is within 3x3 grid
        if (newTileX >= 0 && newTileX < 3 && newTileY >= 0 && newTileY < 3) {
            const newTileKey = `${newTileX},${newTileY}`;
            const tileFiles = this.allTileFiles.get(newTileKey) || [];
            
            if (tileFiles.length > 0) {
                this.currentTile = { x: newTileX, y: newTileY };
                this.loadCurrentTile();

                document.getElementById('fileInfo').textContent =
                    `Current tile: (${newTileX}, ${newTileY}) - ${tileFiles[0].file.name}`;
            } else {
                console.log(`Tile (${newTileX}, ${newTileY}) has no file assigned`);
                document.getElementById('fileInfo').textContent =
                    `Current tile: (${newTileX}, ${newTileY}) - No file available`;
            }
        } else {
            console.log(`Tile (${newTileX}, ${newTileY}) is out of bounds`);
        }
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