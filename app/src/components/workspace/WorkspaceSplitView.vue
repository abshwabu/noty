<script setup lang="ts">
import type { WorkspaceNode } from '../../types/workspace';
import WorkspacePane from './WorkspacePane.vue';

const props = defineProps<{
  node: WorkspaceNode;
}>();

function startSplitResize(index: number, e: MouseEvent) {
  if (props.node.type !== 'split') return;
  const split = props.node;
  const isHorizontal = split.direction === 'horizontal';
  const startPos = isHorizontal ? e.clientX : e.clientY;
  const initialRatios = [...split.flexRatios];

  const onMouseMove = (ev: MouseEvent) => {
    const currentPos = isHorizontal ? ev.clientX : ev.clientY;
    const delta = (currentPos - startPos) / 500;
    const newRatioA = Math.max(0.2, initialRatios[index] + delta);
    const newRatioB = Math.max(0.2, initialRatios[index + 1] - delta);

    split.flexRatios[index] = newRatioA;
    split.flexRatios[index + 1] = newRatioB;
  };

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}
</script>

<template>
  <!-- If Leaf: Render WorkspacePane -->
  <WorkspacePane
    v-if="node.type === 'leaf'"
    :leaf="node"
    class="flex-1 min-w-0 min-h-0"
  />

  <!-- If Split: Render Flex Container with Resizers -->
  <div
    v-else-if="node.type === 'split'"
    class="h-full w-full flex overflow-hidden"
    :class="node.direction === 'horizontal' ? 'flex-row' : 'flex-col'"
  >
    <template v-for="(child, idx) in node.children" :key="child.id">
      <div
        class="min-w-0 min-h-0 overflow-hidden flex flex-col"
        :style="{ flex: `${node.flexRatios[idx] || 1} 1 0%` }"
      >
        <WorkspaceSplitView :node="child" />
      </div>

      <!-- Divider / Split Resizer Handle -->
      <div
        v-if="idx < node.children.length - 1"
        class="bg-[var(--background-modifier-border)] hover:bg-[var(--interactive-accent)] transition-colors z-20 shrink-0"
        :class="[
          node.direction === 'horizontal'
            ? 'w-1 cursor-col-resize hover:w-1.5'
            : 'h-1 cursor-row-resize hover:h-1.5',
        ]"
        @mousedown="(e) => startSplitResize(idx, e)"
      />
    </template>
  </div>
</template>
