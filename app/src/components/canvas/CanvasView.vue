<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from '../../stores/vault';
import { useWorkspaceStore } from '../../stores/workspace';
import type { CanvasData, CanvasNode, CanvasEdge, CanvasSide } from '../../types/canvas';
import {
  Type,
  FileText,
  Link,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  ExternalLink,
} from 'lucide-vue-next';

const props = defineProps<{
  path: string;
  leafId?: string;
}>();

const vault = useVaultStore();
const workspace = useWorkspaceStore();

const canvasData = ref<CanvasData>({
  nodes: [],
  edges: [],
});

const isLoaded = ref(false);
const saveStatus = ref<'Saved' | 'Saving...'>('Saved');

// Pan & Zoom state
const panX = ref(100);
const panY = ref(100);
const zoom = ref(1);
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });

// Selection & Drag state
const selectedNodeId = ref<string | null>(null);
const selectedEdgeId = ref<string | null>(null);
const draggingNodeId = ref<string | null>(null);
const dragOffset = ref({ x: 0, y: 0 });
const resizingNodeId = ref<string | null>(null);
const resizeStart = ref({ w: 0, h: 0, x: 0, y: 0 });

// Edge creation state
const connectingFrom = ref<{ nodeId: string; side: CanvasSide } | null>(null);
const connectingMousePos = ref({ x: 0, y: 0 });

const colorMap: Record<string, string> = {
  '1': '#ef4444', // Red
  '2': '#f97316', // Orange
  '3': '#eab308', // Yellow
  '4': '#22c55e', // Green
  '5': '#06b6d4', // Cyan
  '6': '#a855f7', // Purple
};

async function loadCanvas() {
  if (!props.path) return;
  try {
    const raw = await invoke<string>('vault_read_file', { relativePath: props.path });
    if (raw && raw.trim()) {
      const parsed = JSON.parse(raw);
      canvasData.value = {
        nodes: parsed.nodes || [],
        edges: parsed.edges || [],
      };
    } else {
      // Default initial canvas
      canvasData.value = {
        nodes: [
          {
            id: 'welcome-card',
            type: 'text',
            text: '# Welcome to Canvas\n\n- Drag to move cards\n- Drag connection handles to link cards\n- Fully compatible with Obsidian `.canvas` format',
            x: 100,
            y: 100,
            width: 320,
            height: 180,
            color: '6',
          },
        ],
        edges: [],
      };
    }
  } catch (err) {
    console.warn('Failed to load canvas data:', err);
  } finally {
    isLoaded.value = true;
  }
}

let saveTimer: any = null;
function triggerSave() {
  saveStatus.value = 'Saving...';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await invoke('vault_write_file', {
        relativePath: props.path,
        content: JSON.stringify(canvasData.value, null, 2),
      });
      saveStatus.value = 'Saved';
    } catch (e) {
      console.warn('Failed to save canvas:', e);
    }
  }, 500);
}

// Coordinate transforms
function screenToCanvas(clientX: number, clientY: number, containerRect: DOMRect) {
  return {
    x: (clientX - containerRect.left - panX.value) / zoom.value,
    y: (clientY - containerRect.top - panY.value) / zoom.value,
  };
}

function handleWheel(e: WheelEvent) {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.min(Math.max(zoom.value * zoomFactor, 0.2), 3.0);
  zoom.value = newZoom;
}

// Touch Pinch-to-zoom & Touch Pan for Android / Mobile
let touchStartDist = 0;
let initialZoom = 1;
let touchPanStart = { x: 0, y: 0 };

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    touchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    initialZoom = zoom.value;
  } else if (e.touches.length === 1) {
    const target = e.target as HTMLElement;
    if (target.classList.contains('canvas-background') || target.tagName === 'svg') {
      isPanning.value = true;
      touchPanStart = {
        x: e.touches[0].clientX - panX.value,
        y: e.touches[0].clientY - panY.value,
      };
    }
  }
}

function handleTouchMove(e: TouchEvent) {
  if (e.touches.length === 2 && touchStartDist > 0) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const scale = dist / touchStartDist;
    zoom.value = Math.min(Math.max(initialZoom * scale, 0.2), 3.0);
  } else if (e.touches.length === 1 && isPanning.value) {
    panX.value = e.touches[0].clientX - touchPanStart.x;
    panY.value = e.touches[0].clientY - touchPanStart.y;
  }
}

function handleTouchEnd(e: TouchEvent) {
  if (e.touches.length < 2) {
    touchStartDist = 0;
  }
  if (e.touches.length === 0) {
    isPanning.value = false;
  }
}

function handleMouseDownBackground(e: MouseEvent) {
  // Only pan if clicking on empty canvas background
  const target = e.target as HTMLElement;
  if (target.classList.contains('canvas-background') || target.tagName === 'svg') {
    isPanning.value = true;
    panStart.value = { x: e.clientX - panX.value, y: e.clientY - panY.value };
    selectedNodeId.value = null;
    selectedEdgeId.value = null;
  }
}

function handleMouseMove(e: MouseEvent) {
  if (isPanning.value) {
    panX.value = e.clientX - panStart.value.x;
    panY.value = e.clientY - panStart.value.y;
    return;
  }

  if (draggingNodeId.value) {
    const node = canvasData.value.nodes.find((n) => n.id === draggingNodeId.value);
    if (node) {
      node.x = (e.clientX - dragOffset.value.x) / zoom.value;
      node.y = (e.clientY - dragOffset.value.y) / zoom.value;
      triggerSave();
    }
    return;
  }

  if (resizingNodeId.value) {
    const node = canvasData.value.nodes.find((n) => n.id === resizingNodeId.value);
    if (node) {
      const dx = (e.clientX - resizeStart.value.x) / zoom.value;
      const dy = (e.clientY - resizeStart.value.y) / zoom.value;
      node.width = Math.max(160, resizeStart.value.w + dx);
      node.height = Math.max(100, resizeStart.value.h + dy);
      triggerSave();
    }
    return;
  }

  if (connectingFrom.value) {
    const container = document.querySelector('.canvas-viewport') as HTMLElement;
    if (container) {
      const rect = container.getBoundingClientRect();
      connectingMousePos.value = screenToCanvas(e.clientX, e.clientY, rect);
    }
  }
}

function handleMouseUp() {
  isPanning.value = false;
  draggingNodeId.value = null;
  resizingNodeId.value = null;
  connectingFrom.value = null;
}

// Node actions
function addTextNode() {
  const newNode: CanvasNode = {
    id: `node-${Date.now()}`,
    type: 'text',
    text: 'Double click to edit markdown text...',
    x: (-panX.value + 200) / zoom.value,
    y: (-panY.value + 150) / zoom.value,
    width: 260,
    height: 140,
    color: '5',
  };
  canvasData.value.nodes.push(newNode);
  selectedNodeId.value = newNode.id;
  triggerSave();
}

function addFileNode() {
  const firstMd = vault.allFilePaths.find((p) => p.endsWith('.md')) || 'Welcome.md';
  const newNode: CanvasNode = {
    id: `node-${Date.now()}`,
    type: 'file',
    file: firstMd,
    x: (-panX.value + 250) / zoom.value,
    y: (-panY.value + 200) / zoom.value,
    width: 280,
    height: 180,
    color: '4',
  };
  canvasData.value.nodes.push(newNode);
  selectedNodeId.value = newNode.id;
  triggerSave();
}

function addLinkNode() {
  const url = prompt('Enter link URL (e.g. https://obsidian.md):', 'https://');
  if (!url) return;
  const newNode: CanvasNode = {
    id: `node-${Date.now()}`,
    type: 'link',
    url,
    x: (-panX.value + 220) / zoom.value,
    y: (-panY.value + 180) / zoom.value,
    width: 260,
    height: 120,
    color: '3',
  };
  canvasData.value.nodes.push(newNode);
  selectedNodeId.value = newNode.id;
  triggerSave();
}

function addGroupNode() {
  const label = prompt('Enter group label:', 'New Group') || 'Group';
  const newNode: CanvasNode = {
    id: `node-${Date.now()}`,
    type: 'group',
    label,
    x: (-panX.value + 150) / zoom.value,
    y: (-panY.value + 120) / zoom.value,
    width: 500,
    height: 350,
    color: '1',
  };
  // Groups sit at the bottom of z-index
  canvasData.value.nodes.unshift(newNode);
  selectedNodeId.value = newNode.id;
  triggerSave();
}

function startDragNode(node: CanvasNode, e: MouseEvent) {
  e.stopPropagation();
  selectedNodeId.value = node.id;
  draggingNodeId.value = node.id;
  dragOffset.value = {
    x: e.clientX - node.x * zoom.value,
    y: e.clientY - node.y * zoom.value,
  };
}

function startResizeNode(node: CanvasNode, e: MouseEvent) {
  e.stopPropagation();
  resizingNodeId.value = node.id;
  resizeStart.value = {
    w: node.width,
    h: node.height,
    x: e.clientX,
    y: e.clientY,
  };
}

function deleteSelected() {
  if (selectedNodeId.value) {
    const id = selectedNodeId.value;
    canvasData.value.nodes = canvasData.value.nodes.filter((n) => n.id !== id);
    canvasData.value.edges = canvasData.value.edges.filter((ed) => ed.fromNode !== id && ed.toNode !== id);
    selectedNodeId.value = null;
    triggerSave();
  } else if (selectedEdgeId.value) {
    const id = selectedEdgeId.value;
    canvasData.value.edges = canvasData.value.edges.filter((ed) => ed.id !== id);
    selectedEdgeId.value = null;
    triggerSave();
  }
}

// Connect handles
function startConnect(nodeId: string, side: CanvasSide, e: MouseEvent) {
  e.stopPropagation();
  connectingFrom.value = { nodeId, side };
  const container = document.querySelector('.canvas-viewport') as HTMLElement;
  if (container) {
    const rect = container.getBoundingClientRect();
    connectingMousePos.value = screenToCanvas(e.clientX, e.clientY, rect);
  }
}

function completeConnect(toNodeId: string, toSide: CanvasSide, e: MouseEvent) {
  e.stopPropagation();
  if (!connectingFrom.value) return;
  if (connectingFrom.value.nodeId === toNodeId) {
    connectingFrom.value = null;
    return;
  }

  const newEdge: CanvasEdge = {
    id: `edge-${Date.now()}`,
    fromNode: connectingFrom.value.nodeId,
    fromSide: connectingFrom.value.side,
    toNode: toNodeId,
    toSide,
    toEnd: 'arrow',
  };

  canvasData.value.edges.push(newEdge);
  connectingFrom.value = null;
  triggerSave();
}

function getNodeSideAnchor(node: CanvasNode, side: CanvasSide) {
  switch (side) {
    case 'top':
      return { x: node.x + node.width / 2, y: node.y };
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case 'left':
      return { x: node.x, y: node.y + node.height / 2 };
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height / 2 };
  }
}

function calculatePath(fromPos: { x: number; y: number }, toPos: { x: number; y: number }, fromSide: CanvasSide, toSide: CanvasSide) {
  const dx = Math.abs(toPos.x - fromPos.x) * 0.5;
  const dy = Math.abs(toPos.y - fromPos.y) * 0.5;

  let cp1 = { ...fromPos };
  let cp2 = { ...toPos };

  if (fromSide === 'right') cp1.x += Math.max(40, dx);
  if (fromSide === 'left') cp1.x -= Math.max(40, dx);
  if (fromSide === 'bottom') cp1.y += Math.max(40, dy);
  if (fromSide === 'top') cp1.y -= Math.max(40, dy);

  if (toSide === 'right') cp2.x += Math.max(40, dx);
  if (toSide === 'left') cp2.x -= Math.max(40, dx);
  if (toSide === 'bottom') cp2.y += Math.max(40, dy);
  if (toSide === 'top') cp2.y -= Math.max(40, dy);

  return `M ${fromPos.x} ${fromPos.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${toPos.x} ${toPos.y}`;
}

function openNoteFile(filePath: string) {
  workspace.openNote(filePath);
}

function setNodeColor(node: CanvasNode, colorKey: string) {
  node.color = colorKey;
  triggerSave();
}

const connectingPreviewPath = computed(() => {
  if (!connectingFrom.value) return null;
  const n = canvasData.value.nodes.find(node => node.id === connectingFrom.value?.nodeId);
  if (!n) return null;
  const fromPos = getNodeSideAnchor(n, connectingFrom.value.side);
  return calculatePath(fromPos, connectingMousePos.value, connectingFrom.value.side, 'left');
});

onMounted(() => {
  loadCanvas();
});

watch(() => props.path, () => {
  loadCanvas();
});
</script>

<template>
  <div
    class="canvas-viewport h-full w-full relative overflow-hidden bg-[var(--background-primary)] select-none"
    @wheel="handleWheel"
    @mousedown="handleMouseDownBackground"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @touchstart.passive="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- Background grid -->
    <div
      class="canvas-background absolute inset-0 pointer-events-auto"
      :style="{
        backgroundPosition: `${panX}px ${panY}px`,
        backgroundSize: `${30 * zoom}px ${30 * zoom}px`,
        backgroundImage: `radial-gradient(circle, var(--background-modifier-border) 1px, transparent 1px)`,
      }"
    ></div>

    <!-- Canvas Transform Layer -->
    <div
      class="canvas-transform-layer absolute inset-0 pointer-events-none origin-top-left"
      :style="{
        transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
      }"
    >
      <!-- SVG Layer for Edges -->
      <svg class="absolute inset-0 overflow-visible pointer-events-none w-full h-full">
        <defs>
          <marker
            id="canvas-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 8 5 L 0 9 z" fill="var(--interactive-accent)" />
          </marker>
        </defs>

        <!-- Existing Edges -->
        <g v-for="edge in canvasData.edges" :key="edge.id">
          <path
            v-if="(() => {
              const fromN = canvasData.nodes.find(n => n.id === edge.fromNode);
              const toN = canvasData.nodes.find(n => n.id === edge.toNode);
              return fromN && toN;
            })()"
            :d="(() => {
              const fromN = canvasData.nodes.find(n => n.id === edge.fromNode)!;
              const toN = canvasData.nodes.find(n => n.id === edge.toNode)!;
              return calculatePath(getNodeSideAnchor(fromN, edge.fromSide), getNodeSideAnchor(toN, edge.toSide), edge.fromSide, edge.toSide);
            })()"
            fill="none"
            :stroke="edge.color ? (colorMap[edge.color] || edge.color) : 'var(--interactive-accent)'"
            stroke-width="2.5"
            marker-end="url(#canvas-arrow)"
            class="pointer-events-auto cursor-pointer hover:stroke-amber-400 transition-colors"
            @click.stop="selectedEdgeId = edge.id; selectedNodeId = null"
          />
        </g>

        <!-- Connecting Edge Preview -->
        <path
          v-if="connectingPreviewPath"
          :d="connectingPreviewPath"
          fill="none"
          stroke="var(--interactive-accent)"
          stroke-width="2"
          stroke-dasharray="4 4"
        />
      </svg>

      <!-- Nodes Layer -->
      <div
        v-for="node in canvasData.nodes"
        :key="node.id"
        class="absolute rounded-xl pointer-events-auto shadow-md transition-shadow group"
        :class="[
          node.type === 'group'
            ? 'border-2 border-dashed border-[var(--background-modifier-border)] bg-[var(--background-secondary)]/20'
            : 'border border-[var(--background-modifier-border)] bg-[var(--background-secondary)]',
          selectedNodeId === node.id ? 'ring-2 ring-[var(--interactive-accent)] shadow-xl' : '',
        ]"
        :style="{
          left: `${node.x}px`,
          top: `${node.y}px`,
          width: `${node.width}px`,
          height: `${node.height}px`,
          borderColor: node.color ? colorMap[node.color] : undefined,
        }"
        @mousedown.stop="selectedNodeId = node.id; selectedEdgeId = null"
      >
        <!-- Node Drag Handle Header -->
        <div
          class="h-7 px-2.5 flex items-center justify-between cursor-move bg-[var(--background-secondary-alt)] border-b border-[var(--background-modifier-border)] rounded-t-xl text-[11px]"
          @mousedown="startDragNode(node, $event)"
        >
          <div class="flex items-center gap-1.5 font-semibold truncate text-[var(--text-muted)]">
            <Type v-if="node.type === 'text'" class="w-3.5 h-3.5" />
            <FileText v-else-if="node.type === 'file'" class="w-3.5 h-3.5 text-[var(--text-accent)]" />
            <Link v-else-if="node.type === 'link'" class="w-3.5 h-3.5 text-cyan-400" />
            <Layers v-else class="w-3.5 h-3.5 text-amber-400" />
            <span class="truncate">{{ node.label || node.file || node.url || 'Card' }}</span>
          </div>

          <!-- Color palette & actions -->
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <span
              v-for="(hex, k) in colorMap"
              :key="k"
              @click.stop="setNodeColor(node, k)"
              class="w-2.5 h-2.5 rounded-full cursor-pointer hover:scale-125 transition-transform"
              :style="{ backgroundColor: hex }"
            ></span>
            <button
              v-if="node.type === 'file' && node.file"
              @click.stop="openNoteFile(node.file)"
              class="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-normal)]"
              title="Open note in workspace"
            >
              <ExternalLink class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Node Content -->
        <div class="p-3 h-[calc(100%-28px)] overflow-y-auto text-xs text-[var(--text-normal)]">
          <!-- Text Node -->
          <textarea
            v-if="node.type === 'text'"
            v-model="node.text"
            @input="triggerSave"
            class="w-full h-full bg-transparent resize-none outline-none leading-relaxed font-sans placeholder:text-[var(--text-muted)]"
            placeholder="Write card text or markdown..."
          ></textarea>

          <!-- File Node -->
          <div v-else-if="node.type === 'file'" class="space-y-1">
            <div class="font-bold text-sm text-[var(--text-accent)] truncate cursor-pointer hover:underline" @click="openNoteFile(node.file || '')">
              {{ (node.file || '').split('/').pop()?.replace(/\.md$/, '') }}
            </div>
            <div class="text-[11px] text-[var(--text-muted)]">
              Embedded vault note. Double-click to open.
            </div>
          </div>

          <!-- Link Node -->
          <div v-else-if="node.type === 'link'" class="space-y-1">
            <a :href="node.url" target="_blank" class="text-cyan-400 hover:underline flex items-center gap-1 break-all">
              <span>{{ node.url }}</span>
              <ExternalLink class="w-3 h-3 shrink-0" />
            </a>
          </div>

          <!-- Group Node -->
          <div v-else-if="node.type === 'group'" class="text-sm font-semibold text-[var(--text-muted)]">
            {{ node.label }}
          </div>
        </div>

        <!-- Resize Handle -->
        <div
          class="absolute bottom-1 right-1 w-3 h-3 cursor-nwse-resize opacity-0 group-hover:opacity-100 flex items-center justify-center text-[var(--text-muted)]"
          @mousedown="startResizeNode(node, $event)"
        >
          ↘
        </div>

        <!-- 4 Connection Handles -->
        <div
          v-for="side in (['top', 'bottom', 'left', 'right'] as CanvasSide[])"
          :key="side"
          class="absolute w-3 h-3 bg-[var(--background-primary)] border-2 border-[var(--interactive-accent)] rounded-full cursor-crosshair opacity-0 group-hover:opacity-100 hover:scale-125 transition-all shadow"
          :style="{
            top: side === 'top' ? '-6px' : side === 'bottom' ? 'calc(100% - 6px)' : 'calc(50% - 6px)',
            left: side === 'left' ? '-6px' : side === 'right' ? 'calc(100% - 6px)' : 'calc(50% - 6px)',
          }"
          @mousedown="startConnect(node.id, side, $event)"
          @mouseup="completeConnect(node.id, side, $event)"
        ></div>
      </div>
    </div>

    <!-- Canvas Floating Toolbar -->
    <div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded-xl shadow-2xl px-3 py-1.5 flex items-center gap-2 text-xs backdrop-blur-md">
      <!-- Add Node buttons -->
      <button
        @click="addTextNode"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-[var(--background-modifier-hover)] text-[var(--text-normal)] transition-colors"
        title="Add text card"
      >
        <Type class="w-4 h-4 text-purple-400" />
        <span>Text</span>
      </button>

      <button
        @click="addFileNode"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-[var(--background-modifier-hover)] text-[var(--text-normal)] transition-colors"
        title="Add file card"
      >
        <FileText class="w-4 h-4 text-emerald-400" />
        <span>File</span>
      </button>

      <button
        @click="addLinkNode"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-[var(--background-modifier-hover)] text-[var(--text-normal)] transition-colors"
        title="Add web link"
      >
        <Link class="w-4 h-4 text-cyan-400" />
        <span>Link</span>
      </button>

      <button
        @click="addGroupNode"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-[var(--background-modifier-hover)] text-[var(--text-normal)] transition-colors"
        title="Add group"
      >
        <Layers class="w-4 h-4 text-amber-400" />
        <span>Group</span>
      </button>

      <div class="h-4 w-px bg-[var(--background-modifier-border)] my-auto mx-1"></div>

      <!-- Zoom controls -->
      <button
        @click="zoom = Math.max(0.2, zoom - 0.15)"
        class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
        title="Zoom out"
      >
        <ZoomOut class="w-4 h-4" />
      </button>
      <span class="text-[10px] font-mono w-9 text-center">{{ Math.round(zoom * 100) }}%</span>
      <button
        @click="zoom = Math.min(3.0, zoom + 0.15)"
        class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
        title="Zoom in"
      >
        <ZoomIn class="w-4 h-4" />
      </button>
      <button
        @click="zoom = 1; panX = 100; panY = 100"
        class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
        title="Reset view"
      >
        <Maximize2 class="w-4 h-4" />
      </button>

      <!-- Delete Selected -->
      <template v-if="selectedNodeId || selectedEdgeId">
        <div class="h-4 w-px bg-[var(--background-modifier-border)] my-auto mx-1"></div>
        <button
          @click="deleteSelected"
          class="p-1 rounded text-red-400 hover:bg-red-950/40"
          title="Delete selected element"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </template>
    </div>

    <!-- Status pill -->
    <div class="absolute top-3 right-4 z-20 text-[10px] text-[var(--text-muted)] bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] px-2.5 py-1 rounded-full shadow">
      {{ canvasData.nodes.length }} cards • {{ canvasData.edges.length }} links • {{ saveStatus }}
    </div>
  </div>
</template>
