<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useWorkspaceStore } from '../stores/workspace';
import { useVaultStore } from '../stores/vault';
import { getGraphData } from '../services/metadata';
import type { GraphData, GraphNode as MetaNode, GraphEdge as MetaEdge } from '../types/metadata';
import {
  X,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sliders,
  Layers,
  Palette,
  Eye,
  EyeOff,
} from 'lucide-vue-next';

const workspace = useWorkspaceStore();
const vault = useVaultStore();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// Simulation Node interface
interface SimNode {
  id: string;
  name: string;
  path: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  linkCount: number;
  tags: string[];
  color: string;
  isOrphan: boolean;
  distanceFromCenter?: number;
}

interface SimEdge {
  source: SimNode;
  target: SimNode;
}

const canvasRef = ref<HTMLCanvasElement | null>(null);
let animationFrameId: number | null = null;

// Controls State
const isLocalGraph = ref(false);
const localDepth = ref(1); // 1, 2, 3 hops
const searchQuery = ref('');
const hideOrphans = ref(false);
const showSettings = ref(false);
const nodeSizeMultiplier = ref(1.0);

// Tag Color Groups
interface ColorGroup {
  tag: string;
  color: string;
}
const colorGroups = ref<ColorGroup[]>([
  { tag: 'project', color: '#a855f7' }, // purple
  { tag: 'tauri', color: '#38bdf8' }, // sky
  { tag: 'rust', color: '#f97316' }, // orange
  { tag: 'notes', color: '#10b981' }, // emerald
  { tag: 'todo', color: '#facc15' }, // yellow
]);
const newGroupTag = ref('');
const newGroupColor = ref('#ec4899');

// Camera & Drag State
const zoom = ref(1.0);
const panX = ref(0);
const panY = ref(0);
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let draggedNode: SimNode | null = null;
let hoveredNode: SimNode | null = null;

// Graph data collections
let allNodes: SimNode[] = [];
let allEdges: SimEdge[] = [];
let activeSimNodes: SimNode[] = [];
let activeSimEdges: SimEdge[] = [];
let simAlpha = 1.0;

const activeNotePath = computed(() => workspace.activeNotePath || vault.activeFilePath || '');

async function fetchAndInitializeGraph() {
  let rawData: GraphData;
  try {
    rawData = await getGraphData();
  } catch {
    rawData = { nodes: [], edges: [] };
  }

  // Fallback: populate from vault files if index was empty or dev mock
  if (rawData.nodes.length === 0) {
    const files = vault.allFilePaths.filter((p) => p.endsWith('.md'));
    const generatedNodes: MetaNode[] = files.map((f) => ({
      id: f,
      name: f.replace(/\.md$/, '').split('/').pop() || f,
      path: f,
      link_count: 1,
      tags: ['note'],
    }));
    const generatedEdges: MetaEdge[] = [];
    if (generatedNodes.length >= 2) {
      for (let i = 0; i < generatedNodes.length - 1; i++) {
        generatedEdges.push({
          source: generatedNodes[i].id,
          target: generatedNodes[i + 1].id,
        });
      }
    }
    rawData = { nodes: generatedNodes, edges: generatedEdges };
  }

  buildSimulationGraph(rawData);
}

function getNodeColor(tags: string[]): string {
  for (const group of colorGroups.value) {
    if (tags.some((t) => t.toLowerCase().includes(group.tag.toLowerCase()))) {
      return group.color;
    }
  }
  return 'var(--interactive-accent, #7c3aed)';
}

function buildSimulationGraph(data: GraphData) {
  const nodeMap = new Map<string, SimNode>();
  const width = canvasRef.value?.width || 800;
  const height = canvasRef.value?.height || 600;

  // Compute connections count
  const degreeMap = new Map<string, number>();
  data.edges.forEach((e) => {
    degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
  });

  allNodes = data.nodes.map((n, i) => {
    // Initial circular layout
    const angle = (i / Math.max(1, data.nodes.length)) * 2 * Math.PI;
    const r = 100 + Math.random() * 250;
    const x = width / 2 + Math.cos(angle) * r;
    const y = height / 2 + Math.sin(angle) * r;
    const count = degreeMap.get(n.id) || n.link_count || 0;
    const radius = Math.max(4, Math.min(18, 4 + count * 2));

    const node: SimNode = {
      id: n.id,
      name: n.name,
      path: n.path,
      x,
      y,
      vx: 0,
      vy: 0,
      radius,
      linkCount: count,
      tags: n.tags || [],
      color: getNodeColor(n.tags || []),
      isOrphan: count === 0,
    };
    nodeMap.set(node.id, node);
    // Also map by stem
    const stem = node.name.toLowerCase();
    if (!nodeMap.has(stem)) nodeMap.set(stem, node);
    return node;
  });

  allEdges = [];
  data.edges.forEach((e) => {
    const src = nodeMap.get(e.source) || nodeMap.get(e.source.replace(/\.md$/, '').toLowerCase());
    const tgt = nodeMap.get(e.target) || nodeMap.get(e.target.replace(/\.md$/, '').toLowerCase());
    if (src && tgt && src !== tgt) {
      allEdges.push({ source: src, target: tgt });
    }
  });

  filterActiveGraph();
  simAlpha = 1.0;
  startSimulation();
}

function filterActiveGraph() {
  let nodes = [...allNodes];

  // 1. Orphan Filter
  if (hideOrphans.value) {
    nodes = nodes.filter((n) => !n.isOrphan);
  }

  // 2. Search Query Filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    nodes = nodes.filter(
      (n) => n.name.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  // 3. Local Graph Filter (center around active note within localDepth)
  if (isLocalGraph.value && activeNotePath.value) {
    const targetStem = activeNotePath.value.replace(/\.md$/, '').split('/').pop()?.toLowerCase();
    const centerNode = allNodes.find(
      (n) =>
        n.path === activeNotePath.value ||
        n.name.toLowerCase() === targetStem
    );

    if (centerNode) {
      const visited = new Set<string>([centerNode.id]);
      let currentWave = [centerNode];

      for (let hop = 0; hop < localDepth.value; hop++) {
        const nextWave: SimNode[] = [];
        for (const curr of currentWave) {
          for (const edge of allEdges) {
            if (edge.source.id === curr.id && !visited.has(edge.target.id)) {
              visited.add(edge.target.id);
              nextWave.push(edge.target);
            } else if (edge.target.id === curr.id && !visited.has(edge.source.id)) {
              visited.add(edge.source.id);
              nextWave.push(edge.source);
            }
          }
        }
        currentWave = nextWave;
      }

      nodes = nodes.filter((n) => visited.has(n.id));
    }
  }

  const activeSet = new Set(nodes.map((n) => n.id));
  activeSimNodes = nodes;
  activeSimEdges = allEdges.filter(
    (e) => activeSet.has(e.source.id) && activeSet.has(e.target.id)
  );

  simAlpha = 1.0;
}

// Force-Directed Physics Step
function stepPhysics() {
  if (simAlpha < 0.005) return; // simulation settled

  const cx = (canvasRef.value?.width || 800) / 2;
  const cy = (canvasRef.value?.height || 600) / 2;
  const kSpring = 0.04;
  const idealDist = 70;
  const kRepulsion = 450;
  const kGravity = 0.015;

  // 1. Repulsion between nodes (charge)
  for (let i = 0; i < activeSimNodes.length; i++) {
    const n1 = activeSimNodes[i];
    for (let j = i + 1; j < activeSimNodes.length; j++) {
      const n2 = activeSimNodes[j];
      let dx = n2.x - n1.x;
      let dy = n2.y - n1.y;
      let distSq = dx * dx + dy * dy;
      if (distSq < 1) distSq = 1;
      const dist = Math.sqrt(distSq);

      if (dist < 300) {
        const force = (kRepulsion / distSq) * simAlpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        n1.vx -= fx;
        n1.vy -= fy;
        n2.vx += fx;
        n2.vy += fy;
      }
    }
  }

  // 2. Link Attraction (springs)
  for (const edge of activeSimEdges) {
    const src = edge.source;
    const tgt = edge.target;
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const displacement = dist - idealDist;
    const force = displacement * kSpring * simAlpha;

    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    src.vx += fx;
    src.vy += fy;
    tgt.vx -= fx;
    tgt.vy -= fy;
  }

  // 3. Gravity to center & Position update
  for (const node of activeSimNodes) {
    if (node === draggedNode) continue; // locked to mouse

    const gx = (cx - node.x) * kGravity * simAlpha;
    const gy = (cy - node.y) * kGravity * simAlpha;

    node.vx = (node.vx + gx) * 0.85; // damping
    node.vy = (node.vy + gy) * 0.85;

    node.x += node.vx;
    node.y += node.vy;
  }

  simAlpha *= 0.985;
}

// Render Loop
function render() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  stepPhysics();

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  // Apply Zoom and Pan transform
  ctx.translate(panX.value, panY.value);
  ctx.scale(zoom.value, zoom.value);

  // 1. Draw Edges
  for (const edge of activeSimEdges) {
    const isHoverConnected =
      hoveredNode && (edge.source === hoveredNode || edge.target === hoveredNode);

    ctx.beginPath();
    ctx.moveTo(edge.source.x, edge.source.y);
    ctx.lineTo(edge.target.x, edge.target.y);

    if (isHoverConnected) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.0;
    } else {
      ctx.strokeStyle = 'rgba(150, 150, 160, 0.22)';
      ctx.lineWidth = 1.0;
    }
    ctx.stroke();
  }

  // 2. Draw Nodes
  for (const node of activeSimNodes) {
    const isHovered = hoveredNode === node;
    const isConnected =
      hoveredNode &&
      (hoveredNode === node ||
        activeSimEdges.some(
          (e) =>
            (e.source === hoveredNode && e.target === node) ||
            (e.target === hoveredNode && e.source === node)
        ));

    const radius = node.radius * nodeSizeMultiplier.value;

    // Outer glow for hovered or searched
    if (isHovered || isConnected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(124, 58, 237, 0.35)';
      ctx.fill();
    }

    // Node Circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = isHovered ? '#ffffff' : node.color;
    ctx.fill();

    // Node Border
    ctx.strokeStyle = isHovered ? '#7c3aed' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Label Rendering (Adaptive Level of Detail)
    const shouldDrawLabel =
      isHovered ||
      isConnected ||
      zoom.value >= 1.2 ||
      (zoom.value >= 0.8 && node.linkCount >= 2) ||
      activeSimNodes.length <= 100;

    if (shouldDrawLabel) {
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(220, 220, 230, 0.85)';
      ctx.textAlign = 'center';
      ctx.fillText(node.name, node.x, node.y + radius + 12);
    }
  }

  ctx.restore();

  animationFrameId = requestAnimationFrame(render);
}

function startSimulation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }
  animationFrameId = requestAnimationFrame(render);
}

// Mouse / Touch Event Handlers
function handleMouseDown(e: MouseEvent) {
  const rect = canvasRef.value?.getBoundingClientRect();
  if (!rect) return;
  const clickX = (e.clientX - rect.left - panX.value) / zoom.value;
  const clickY = (e.clientY - rect.top - panY.value) / zoom.value;

  // Check if a node was clicked
  const clicked = activeSimNodes.find((n) => {
    const dx = n.x - clickX;
    const dy = n.y - clickY;
    return dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6);
  });

  if (clicked) {
    draggedNode = clicked;
    simAlpha = 0.8;
  } else {
    isPanning = true;
    startPanX = e.clientX - panX.value;
    startPanY = e.clientY - panY.value;
  }
}

function handleMouseMove(e: MouseEvent) {
  const rect = canvasRef.value?.getBoundingClientRect();
  if (!rect) return;
  const worldX = (e.clientX - rect.left - panX.value) / zoom.value;
  const worldY = (e.clientY - rect.top - panY.value) / zoom.value;

  if (draggedNode) {
    draggedNode.x = worldX;
    draggedNode.y = worldY;
    draggedNode.vx = 0;
    draggedNode.vy = 0;
    simAlpha = 0.5;
  } else if (isPanning) {
    panX.value = e.clientX - startPanX;
    panY.value = e.clientY - startPanY;
  } else {
    // Check hover
    hoveredNode =
      activeSimNodes.find((n) => {
        const dx = n.x - worldX;
        const dy = n.y - worldY;
        return dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6);
      }) || null;
  }
}

function handleMouseUp(e: MouseEvent) {
  if (draggedNode) {
    const rect = canvasRef.value?.getBoundingClientRect();
    if (rect) {
      const clickX = (e.clientX - rect.left - panX.value) / zoom.value;
      const clickY = (e.clientY - rect.top - panY.value) / zoom.value;
      const dx = draggedNode.x - clickX;
      const dy = draggedNode.y - clickY;
      // If drag distance is very small, treat as a click to open note
      if (dx * dx + dy * dy < 16) {
        openNote(draggedNode.path);
      }
    }
    draggedNode = null;
  }
  isPanning = false;
}

function handleWheel(e: WheelEvent) {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
  const newZoom = Math.min(3.5, Math.max(0.2, zoom.value * zoomFactor));

  // Zoom centered on cursor
  const rect = canvasRef.value?.getBoundingClientRect();
  if (!rect) return;
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  panX.value = mouseX - (mouseX - panX.value) * (newZoom / zoom.value);
  panY.value = mouseY - (mouseY - panY.value) * (newZoom / zoom.value);
  zoom.value = newZoom;
}

// Mobile Pinch-to-zoom & Touch Pan
let touchPinchDist = 0;
let initialTouchZoom = 1;
let touchPanStartX = 0;
let touchPanStartY = 0;

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    touchPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    initialTouchZoom = zoom.value;
  } else if (e.touches.length === 1) {
    isPanning = true;
    touchPanStartX = e.touches[0].clientX - panX.value;
    touchPanStartY = e.touches[0].clientY - panY.value;
  }
}

function handleTouchMove(e: TouchEvent) {
  if (e.touches.length === 2 && touchPinchDist > 0) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const scale = currentDist / touchPinchDist;
    zoom.value = Math.min(3.5, Math.max(0.2, initialTouchZoom * scale));
  } else if (e.touches.length === 1 && isPanning) {
    panX.value = e.touches[0].clientX - touchPanStartX;
    panY.value = e.touches[0].clientY - touchPanStartY;
  }
}

function handleTouchEnd(e: TouchEvent) {
  if (e.touches.length < 2) {
    touchPinchDist = 0;
  }
  if (e.touches.length === 0) {
    isPanning = false;
  }
}

function resetZoom() {
  zoom.value = 1.0;
  panX.value = 0;
  panY.value = 0;
  simAlpha = 1.0;
}

function openNote(path: string) {
  workspace.openNote(path);
  emit('close');
}

function addColorGroup() {
  if (!newGroupTag.value.trim()) return;
  colorGroups.value.push({
    tag: newGroupTag.value.trim(),
    color: newGroupColor.value,
  });
  newGroupTag.value = '';
  // Recalculate node colors
  allNodes.forEach((n) => {
    n.color = getNodeColor(n.tags);
  });
}

function removeColorGroup(idx: number) {
  colorGroups.value.splice(idx, 1);
  allNodes.forEach((n) => {
    n.color = getNodeColor(n.tags);
  });
}

// Watch filters
watch([searchQuery, hideOrphans, isLocalGraph, localDepth], () => {
  filterActiveGraph();
});

onMounted(() => {
  nextTick(() => {
    if (canvasRef.value) {
      canvasRef.value.width = canvasRef.value.parentElement?.clientWidth || 900;
      canvasRef.value.height = canvasRef.value.parentElement?.clientHeight || 600;
    }
    fetchAndInitializeGraph();
  });
});

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }
});
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
    <div class="bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded-xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden relative">
      <!-- Top Bar -->
      <div class="h-12 border-b border-[var(--background-modifier-border)] px-4 flex items-center justify-between bg-[var(--background-secondary)] shrink-0">
        <!-- Title and Mode Switcher -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 font-semibold text-sm text-[var(--text-accent)]">
            <Layers class="w-4 h-4" />
            <span>Graph View</span>
          </div>

          <div class="flex items-center bg-[var(--background-modifier-form-field)] p-0.5 rounded-lg border border-[var(--background-modifier-border)] text-xs">
            <button
              @click="isLocalGraph = false"
              class="px-2.5 py-1 rounded-md font-medium transition-colors"
              :class="!isLocalGraph ? 'bg-[var(--interactive-accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
            >
              Global Graph
            </button>
            <button
              @click="isLocalGraph = true"
              class="px-2.5 py-1 rounded-md font-medium transition-colors"
              :class="isLocalGraph ? 'bg-[var(--interactive-accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
            >
              Local Graph
            </button>
          </div>

          <!-- Node / Edge Counts -->
          <span class="text-xs text-[var(--text-muted)] font-mono ml-2">
            {{ activeSimNodes.length }} nodes • {{ activeSimEdges.length }} edges
          </span>
        </div>

        <!-- Search & Control Actions -->
        <div class="flex items-center gap-2">
          <!-- Search in Graph -->
          <div class="relative w-48">
            <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search nodes or tags..."
              class="w-full pl-8 pr-3 py-1 bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded-md text-xs text-[var(--text-normal)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--interactive-accent)]"
            />
          </div>

          <!-- Toggle Settings / Filters Drawer -->
          <button
            @click="showSettings = !showSettings"
            class="p-1.5 rounded-md border border-[var(--background-modifier-border)] hover:bg-[var(--background-modifier-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-normal)]"
            :class="{ 'bg-[var(--background-modifier-hover)] text-[var(--text-accent)]': showSettings }"
            title="Graph settings and filters"
          >
            <Sliders class="w-4 h-4" />
          </button>

          <!-- Zoom In / Out / Reset -->
          <button
            @click="zoom = Math.min(3.5, zoom * 1.2)"
            class="p-1.5 rounded-md border border-[var(--background-modifier-border)] hover:bg-[var(--background-modifier-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-normal)]"
            title="Zoom In"
          >
            <ZoomIn class="w-4 h-4" />
          </button>
          <button
            @click="zoom = Math.max(0.2, zoom * 0.8)"
            class="p-1.5 rounded-md border border-[var(--background-modifier-border)] hover:bg-[var(--background-modifier-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-normal)]"
            title="Zoom Out"
          >
            <ZoomOut class="w-4 h-4" />
          </button>
          <button
            @click="resetZoom"
            class="p-1.5 rounded-md border border-[var(--background-modifier-border)] hover:bg-[var(--background-modifier-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-normal)]"
            title="Reset view"
          >
            <RotateCcw class="w-4 h-4" />
          </button>

          <!-- Close Modal -->
          <button
            @click="$emit('close')"
            class="p-1.5 rounded-md hover:bg-red-500/10 hover:text-red-400 transition-colors text-[var(--text-muted)] ml-2"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Main Graph Area & Settings Drawer -->
      <div class="flex-1 flex overflow-hidden relative">
        <!-- Canvas Graph Container -->
        <div class="flex-1 h-full w-full relative bg-[var(--background-primary)] cursor-grab active:cursor-grabbing">
          <canvas
            ref="canvasRef"
            class="w-full h-full block"
            @mousedown="handleMouseDown"
            @mousemove="handleMouseMove"
            @mouseup="handleMouseUp"
            @wheel="handleWheel"
            @touchstart="handleTouchStart"
            @touchmove="handleTouchMove"
            @touchend="handleTouchEnd"
          ></canvas>

          <!-- Instructions Hint -->
          <div class="absolute bottom-3 left-4 text-[11px] text-[var(--text-muted)] bg-[var(--background-secondary)]/80 px-2.5 py-1 rounded-md border border-[var(--background-modifier-border)] pointer-events-none backdrop-blur-sm">
            Drag to pan • Scroll to zoom • Click node to open note
          </div>
        </div>

        <!-- Settings & Filters Drawer -->
        <div
          v-if="showSettings"
          class="w-72 h-full bg-[var(--background-secondary)] border-l border-[var(--background-modifier-border)] p-4 overflow-y-auto space-y-4 shrink-0 text-xs text-[var(--text-normal)] select-none animate-in slide-in-from-right duration-150"
        >
          <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-between">
            <span>Filters & Styling</span>
            <button @click="showSettings = false" class="hover:text-[var(--text-normal)]">
              <X class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Local Graph Depth (if local mode) -->
          <div v-if="isLocalGraph" class="space-y-1.5 p-2.5 rounded bg-[var(--background-primary)] border border-[var(--background-modifier-border)]">
            <div class="flex items-center justify-between text-xs font-medium">
              <span>Local Depth</span>
              <span class="font-mono text-[var(--text-accent)]">{{ localDepth }} hops</span>
            </div>
            <input
              v-model.number="localDepth"
              type="range"
              min="1"
              max="4"
              class="w-full accent-[var(--interactive-accent)]"
            />
          </div>

          <!-- Orphan Nodes Toggle -->
          <div class="flex items-center justify-between p-2.5 rounded bg-[var(--background-primary)] border border-[var(--background-modifier-border)]">
            <div>
              <div class="font-medium text-xs">Hide Orphans</div>
              <div class="text-[10px] text-[var(--text-muted)]">Hide unlinked notes</div>
            </div>
            <button
              @click="hideOrphans = !hideOrphans"
              class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)]"
            >
              <component :is="hideOrphans ? EyeOff : Eye" class="w-4 h-4 text-[var(--text-accent)]" />
            </button>
          </div>

          <!-- Node Size Multiplier -->
          <div class="space-y-1.5 p-2.5 rounded bg-[var(--background-primary)] border border-[var(--background-modifier-border)]">
            <div class="flex items-center justify-between text-xs font-medium">
              <span>Node Size</span>
              <span class="font-mono text-[var(--text-accent)]">{{ nodeSizeMultiplier }}x</span>
            </div>
            <input
              v-model.number="nodeSizeMultiplier"
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              class="w-full accent-[var(--interactive-accent)]"
            />
          </div>

          <!-- Tag Color Groups -->
          <div class="space-y-2">
            <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
              <Palette class="w-3.5 h-3.5 text-[var(--text-accent)]" />
              <span>Color Groups</span>
            </div>

            <div class="space-y-1.5">
              <div
                v-for="(grp, idx) in colorGroups"
                :key="idx"
                class="flex items-center justify-between px-2.5 py-1.5 rounded bg-[var(--background-primary)] border border-[var(--background-modifier-border)]"
              >
                <div class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: grp.color }"></span>
                  <span class="font-medium font-mono text-xs">#{{ grp.tag }}</span>
                </div>
                <button
                  @click="removeColorGroup(idx)"
                  class="text-[var(--text-muted)] hover:text-red-400 p-0.5 rounded"
                >
                  <X class="w-3 h-3" />
                </button>
              </div>
            </div>

            <!-- Add Color Group -->
            <div class="flex items-center gap-1.5 mt-2">
              <input
                v-model="newGroupTag"
                type="text"
                placeholder="tag name..."
                class="flex-1 px-2 py-1 bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded text-xs"
              />
              <input
                v-model="newGroupColor"
                type="color"
                class="w-7 h-7 rounded border border-[var(--background-modifier-border)] cursor-pointer bg-transparent"
              />
              <button
                @click="addColorGroup"
                class="px-2 py-1 rounded bg-[var(--interactive-accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
