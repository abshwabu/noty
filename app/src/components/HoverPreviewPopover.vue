<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from '../stores/vault';
import { useWorkspaceStore } from '../stores/workspace';
import { FileText, ExternalLink } from 'lucide-vue-next';

const vault = useVaultStore();
const workspace = useWorkspaceStore();

const isVisible = ref(false);
const popoverX = ref(0);
const popoverY = ref(0);
const targetTitle = ref('');
const targetPath = ref('');
const targetExcerpt = ref('');
let hoverTimer: any = null;

async function showPreviewForTarget(target: string, x: number, y: number) {
  if (!target) return;

  const cleanTarget = target.trim();
  const allFiles = vault.allFilePaths;
  const targetWithMd = cleanTarget.endsWith('.md') ? cleanTarget : `${cleanTarget}.md`;

  const foundPath =
    allFiles.find((f) => f.toLowerCase() === cleanTarget.toLowerCase()) ||
    allFiles.find((f) => f.toLowerCase() === targetWithMd.toLowerCase()) ||
    allFiles.find(
      (f) =>
        f.split('/').pop()?.replace(/\.md$/, '').toLowerCase() ===
        cleanTarget.toLowerCase()
    );

  const pathToRead = foundPath || targetWithMd;
  targetPath.value = pathToRead;
  targetTitle.value = cleanTarget.replace(/\.md$/, '').split('/').pop() || cleanTarget;

  try {
    const rawContent = await invoke<string>('vault_read_file', { relativePath: pathToRead });
    // Excerpt: strip frontmatter and take first ~15 lines
    const contentWithoutFrontmatter = rawContent.replace(/^---[\s\S]*?---\s*/, '');
    const lines = contentWithoutFrontmatter.trim().split('\n').slice(0, 15);
    targetExcerpt.value = lines.join('\n');
  } catch {
    targetExcerpt.value = '*Note does not exist yet. Click to create.*';
  }

  // Position popover, ensuring it fits inside the window
  const width = 340;
  const height = 220;
  let posX = x + 12;
  let posY = y + 16;

  if (posX + width > window.innerWidth) {
    posX = Math.max(10, x - width - 12);
  }
  if (posY + height > window.innerHeight) {
    posY = Math.max(10, y - height - 12);
  }

  popoverX.value = posX;
  popoverY.value = posY;
  isVisible.value = true;
}

function handleMouseOver(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest('[data-wikilink-target]') as HTMLElement | null;
  if (target) {
    const linkTarget = target.getAttribute('data-wikilink-target');
    if (linkTarget) {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        showPreviewForTarget(linkTarget, e.clientX, e.clientY);
      }, 350);
    }
  }
}

function handleMouseOut(e: MouseEvent) {
  const toEl = e.relatedTarget as HTMLElement | null;
  if (toEl?.closest('.hover-preview-popover') || toEl?.closest('[data-wikilink-target]')) {
    return;
  }
  clearTimeout(hoverTimer);
  isVisible.value = false;
}

function openTargetNote() {
  if (targetPath.value) {
    workspace.openNote(targetPath.value);
    isVisible.value = false;
  }
}

onMounted(() => {
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
});

onUnmounted(() => {
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('mouseout', handleMouseOut);
  clearTimeout(hoverTimer);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isVisible"
      class="hover-preview-popover fixed z-50 w-80 max-h-64 bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded-lg shadow-2xl flex flex-col overflow-hidden text-xs text-[var(--text-normal)] select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
      :style="{ left: `${popoverX}px`, top: `${popoverY}px` }"
      @mouseleave="isVisible = false"
    >
      <!-- Header -->
      <div class="px-3 py-2 bg-[var(--background-secondary-alt)] border-b border-[var(--background-modifier-border)] flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 font-semibold text-[var(--text-accent)] truncate">
          <FileText class="w-3.5 h-3.5 shrink-0" />
          <span class="truncate">{{ targetTitle }}</span>
        </div>
        <button
          @click="openTargetNote"
          class="p-1 rounded hover:bg-[var(--background-modifier-hover)] text-[var(--text-muted)] hover:text-[var(--text-normal)] transition-colors"
          title="Open note"
        >
          <ExternalLink class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Content Excerpt -->
      <div class="p-3 overflow-y-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--text-muted)] select-text">
        {{ targetExcerpt }}
      </div>
    </div>
  </Teleport>
</template>
