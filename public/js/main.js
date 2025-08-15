import { GUI } from 'https://esm.sh/dat.gui';

const config = {
    linkWidth: 4,
    nodeColor: node => node.isRoot ? 'gold' : node.name ? 'white' : 'red',
    enableNodeDrag: false,
    nodeResolution: 0,
    maxFriendDepth: 32
};

const globalVars = {
    toggleCtrl: null,
    searchCtrl: null,
    resetCameraCtrl: null,
    fileCtrl: null
};

const Graph = initForceGraph3d(document.getElementById("3d-graph"));

function initForceGraph3d(element) {
    return ForceGraph3D({ controlType: 'orbit' })(element)
        .nodeLabel('name')
        .nodeColor(config.nodeColor)
        .linkWidth(config.linkWidth)
        .enableNodeDrag(config.enableNodeDrag)
        .nodeResolution(config.nodeResolution > 0 ? config.nodeResolution : undefined)
        .cooldownTicks(Infinity)
        .d3AlphaDecay(0)
        .onEngineStop(() => Graph.zoomToFit(400))
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

function initGUIControls(graph) {
    const settings = {
        simInterval: null,
        keepSimulationAlive: false,
        maxFriendDepth: config.maxFriendDepth,
        nodeResolution: config.nodeResolution,
        toggleSimulation: () => {
            settings.keepSimulationAlive = !settings.keepSimulationAlive;

            const li = globalVars.toggleCtrl.__li;
            li.style.borderLeft = settings.keepSimulationAlive ? '3px solid green' : '3px solid #e61d5f';

            if (settings.keepSimulationAlive) {
                settings.simInterval = setInterval(() => {
                    graph.cooldownTicks(Infinity);
                    graph.d3ReheatSimulation();
                }, 500);
            } else {
                graph.cooldownTicks(0);
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

    const gui = new GUI();

    globalVars.searchCtrl = gui.add(settings, 'searchTerm').onChange(value => {
        settings.searchTerm = value.trim().toLowerCase();
        if (!settings.searchTerm) {
            Graph.zoomToFit(400);
            return;
        }

        const match = graph.graphData().nodes.find(
            node => typeof node.name === 'string' && node.name.toLowerCase().includes(settings.searchTerm)
        );
        if (match) focusOnNode(match);
        else Graph.zoomToFit(400);
    }).name('Search (Ctrl + k)');

    globalVars.resetCameraCtrl = gui.add(settings, 'resetCamera').name('Reset Camera (r)');
    globalVars.fileCtrl = gui.add(settings, 'fileInput').name('Upload File (f)');

    const controls = gui.addFolder('Nodes');
    globalVars.toggleCtrl = controls.add(settings, 'toggleSimulation');

    controls.add(settings, 'maxFriendDepth', 2, 128, 1)
        .step(1)
        .onChange(value => {
            const snapped = value > 0 ? Math.pow(2, Math.round(Math.log2(value))) : 2;
            settings.maxFriendDepth = snapped;
            config.maxFriendDepth = snapped;
        });

    controls.add(settings, 'nodeResolution', 0, 128, 1)
        .step(1)
        .onChange(value => {
            const allowed = [0, 1, 8, 16, 128];
            const snapped = allowed.reduce((prev, curr) =>
                Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
            );
            settings.nodeResolution = snapped;
            config.nodeResolution = snapped;
            graph.nodeResolution(config.nodeResolution > 0 ? config.nodeResolution : undefined);
        });
}

function handleFileInput(graph, file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
        let rawData;
        try {
            rawData = JSON.parse(ev.target.result);
        } catch (err) {
            alert("Invalid JSON file. Please upload a valid JSON.");
            return;
        }

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
        traverseIterative(rawData);

        graph.graphData({
            nodes: Array.from(nodes.values()),
            links
        });
    };
    reader.readAsText(file);
}

function eventListeners(graph) {
    const searchInput = globalVars.searchCtrl.domElement.querySelector('input');
    const fileInput = document.getElementById("fileInput");
    const resetCamera = globalVars.resetCameraCtrl.domElement;


    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') searchInput.value = '';
        if (e.key === 'f') fileInput.click();
        if (e.key === 'r' && document.activeElement !== searchInput) resetCamera.click();
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            if (document.activeElement === searchInput) searchInput.blur();
            else searchInput.focus();
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

    fetch("../../users_data_deep.json")
        .then(res => res.blob())
        .then(blob => handleFileInput(Graph, new File([blob], "users_data_deep.json")));
});
