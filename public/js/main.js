import * as THREE from 'three';
import { GUI } from 'https://esm.sh/dat.gui';

const config = {
    linkWidth: 4,
    nodeColor: node => node.isRoot ? 'gold' : node.name ? 'white' : 'red',
    enableNodeDrag: true,
    nodeResolution: 0,
    linkResolution: 0,
    pixelRatio: 1,
    maxFriendDepth: 32
};

const globalVars = {
    simTimeout: null,
    loadedNodes: null,
    settings: null,
    toggleCtrl: null,
    searchCtrl: null,
    resetCameraCtrl: null,
    fileCtrl: null
};

const Graph = initForceGraph3d(document.getElementById("3d-graph"));
Graph.renderer().setPixelRatio(config.pixelRatio);

function initForceGraph3d(element) {
    return ForceGraph3D({ controlType: 'orbit' })(element)
        .nodeLabel('name')
        .nodeColor(config.nodeColor)
        .linkWidth(config.linkWidth)
        .enableNodeDrag(config.enableNodeDrag)
        .nodeResolution(config.nodeResolution > 0 ? config.nodeResolution : undefined)
        .nodeThreeObjectExtend(true)
        .nodeThreeObject(() => {
            const radius = 24;
            const geometry = new THREE.SphereGeometry(radius, 3, 2);
            const material = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geometry, material);
            return mesh;
        })
        .cooldownTicks(Infinity)
        .d3AlphaDecay(0)
        .onEngineStop(() => {
        })
        .onNodeClick(node => focusOnNode(node));
}

function focusOnNode(node) {
    const distance = 256;
    const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);

    const newPos = node.x || node.y || node.z
        ? { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }
        : { x: 0, y: 0, z: distance };

    Graph.cameraPosition(newPos, node, 500);
}

function searchNodes(searchTerm) {
    if (!globalVars.settings) return;

    globalVars.settings.searchTerm = searchTerm.trim().toLowerCase();
    if (!globalVars.settings.searchTerm) {
        Graph.zoomToFit(400);
        return;
    }

    const match = Graph.graphData().nodes.find(
        node => typeof node.name === 'string' && node.name.toLowerCase().includes(globalVars.settings.searchTerm)
    );
    if (match) focusOnNode(match);
    else Graph.zoomToFit(400);
}

function initGUIControls(graph) {
    const settings = {
        simInterval: null,
        keepSimulationAlive: false,
        maxFriendDepth: config.maxFriendDepth,
        nodeResolution: config.nodeResolution,
        linkResolution: config.linkResolution,
        pixelRatio: config.pixelRatio,
        toggleSimulation: (state) => {
            if (state === undefined) settings.keepSimulationAlive = !settings.keepSimulationAlive;
            else settings.keepSimulationAlive = state;

            const li = globalVars.toggleCtrl.__li;
            li.style.borderLeft = settings.keepSimulationAlive ? '3px solid green' : '3px solid #e61d5f';

            if (settings.keepSimulationAlive) {
                settings.simInterval = setInterval(() => {
                    graph.cooldownTicks(Infinity);
                    graph.d3ReheatSimulation();
                }, 500);
            } else {
                graph.cooldownTicks(0);
                settings.resetCamera();
                clearInterval(settings.simInterval);
                settings.simInterval = null;
            }
        },
        searchTerm: '',
        resetCamera: () => {
            Graph.zoomToFit(400);
        },
        fileInput: () => {
            document.getElementById("fileInput").click();
        }
    };
    globalVars.settings = settings;

    const gui = new GUI();

    globalVars.searchCtrl = gui.add(settings, 'searchTerm').onChange(value => {
        searchNodes(value);
    }).name('Search (Ctrl + k)');

    globalVars.resetCameraCtrl = gui.add(settings, 'resetCamera').name('Reset Camera (r)');
    globalVars.fileCtrl = gui.add(settings, 'fileInput').name('Upload File (f)');

    const controls = gui.addFolder('Nodes');
    globalVars.toggleCtrl = controls.add(settings, 'toggleSimulation').name('Toggle Simulation (s)');

    controls.add(settings, 'maxFriendDepth', 1, 128, 1)
        .step(1)
        .onChange(value => {
            settings.maxFriendDepth = value;
            config.maxFriendDepth = value;
            if (globalVars.loadedNodes) createGraph(graph, globalVars.loadedNodes);
        });

    controls.add(settings, 'nodeResolution', 0, 128, 1)
        .step(1)
        .onChange(value => {
            const snapped = [0, ...genPow2Array(8)]
                .reduce((prev, curr) => Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev);

            settings.nodeResolution = snapped;
            config.nodeResolution = snapped;

            settings.linkResolution = snapped;
            config.linkResolution = snapped;

            graph.nodeResolution(config.nodeResolution > 0 ? config.nodeResolution : undefined);
            graph.linkResolution(config.linkResolution > 0 ? config.linkResolution : undefined);
        });

    controls.add(settings, 'pixelRatio', 0, 1, 0.01)
        .step(0.01)
        .onChange(value => {
            settings.pixelRatio = value;
            config.pixelRatio = value;
            graph.renderer().setPixelRatio(value);
        });
}

function genPow2Array(length) {
    return Array.from({ length }, (_, i) => Math.pow(2, i));
}

function createGraph(graph, data) {
    const nodes = new Map();
    const links = [];

    function traverseIterative(rootPerson) {
        const stack = [{ person: rootPerson, depth: 0 }];
        while (stack.length > 0) {
            const { person, depth } = stack.pop();
            if (depth > config.maxFriendDepth) continue;

            if (!nodes.has(person.id)) {
                nodes.set(person.id, { id: person.id, name: person.name, isRoot: depth === 0 });
            }

            if (person.friends && Array.isArray(person.friends)) {
                for (const f of person.friends) {
                    if (!nodes.has(f.id)) nodes.set(f.id, { id: f.id, name: f.name });
                    links.push({ source: person.id, target: f.id });
                    stack.push({ person: f, depth: depth + 1 });
                }
            }
        }
    }
    traverseIterative(data);

    graph.graphData({
        nodes: Array.from(nodes.values()),
        links
    });
}

function handleFileInput(graph, file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
        let rawData;
        try {
            rawData = JSON.parse(ev.target.result);
            globalVars.loadedNodes = rawData;
            createGraph(graph, globalVars.loadedNodes);
        } catch (err) {
            alert("Invalid JSON file. Please upload a valid JSON.");
            return;
        }
    };
    reader.readAsText(file);
}

function eventListeners(graph) {
    const searchInput = globalVars.searchCtrl.domElement.querySelector('input');
    const fileInput = document.getElementById("fileInput");
    const resetCamera = globalVars.resetCameraCtrl.domElement;


    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.activeElement === searchInput) searchInput.value = '';
        if (e.key === 'f' && document.activeElement !== searchInput) fileInput.click();
        if (e.key === 'r' && document.activeElement !== searchInput) resetCamera.click();
        if (e.key === 's' && document.activeElement !== searchInput) {
            clearTimeout(globalVars.simTimeout);
            globalVars.simTimeout = null;
            globalVars.settings.toggleSimulation();
        }
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            if (document.activeElement === searchInput) searchInput.blur();
            else searchInput.focus();
        }
    });

    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchNodes(searchInput.value);
        }
    });

    resetCamera.addEventListener('click', () => {
        graph.zoomToFit(400);
    });

    fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        handleFileInput(graph, file);
    });

    window.addEventListener('resize', () => {
        graph.width(window.innerWidth);
        graph.height(window.innerHeight);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initGUIControls(Graph);
    eventListeners(Graph);

    globalVars.settings.toggleSimulation(true);
    globalVars.simTimeout = setTimeout(() => {
        if (globalVars.settings.keepSimulationAlive) globalVars.settings.toggleSimulation(false);
    }, 5000);

    fetch("/users_data_deep.json")
        .then(res => res.blob())
        .then(blob => handleFileInput(Graph, new File([blob], "users_data_deep.json")));
});