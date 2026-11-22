<script setup lang="ts">
import { useCommandStore } from '../../stores/commands';
import {
  Bold,
  Italic,
  Heading,
  Link,
  CheckSquare,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Quote,
  Code,
  Undo2,
  Redo2,
  Terminal,
} from 'lucide-vue-next';

const commandStore = useCommandStore();

function formatSelection(prefix: string, suffix: string = prefix) {
  window.dispatchEvent(
    new CustomEvent('noty:format-selection', {
      detail: { prefix, suffix },
    })
  );
}

function insertLinePrefix(prefix: string) {
  window.dispatchEvent(
    new CustomEvent('noty:insert-line-prefix', {
      detail: { prefix },
    })
  );
}

function toggleTask() {
  window.dispatchEvent(new CustomEvent('noty:toggle-task'));
}

function indent(isIndent: boolean) {
  window.dispatchEvent(
    new CustomEvent('noty:indent-line', {
      detail: { isIndent },
    })
  );
}

function undo() {
  window.dispatchEvent(new CustomEvent('noty:editor-undo'));
}

function redo() {
  window.dispatchEvent(new CustomEvent('noty:editor-redo'));
}

function openCommandPalette() {
  commandStore.showCommandPalette = true;
}
</script>

<template>
  <div
    class="mobile-keyboard-toolbar h-11 w-full border-t border-[var(--background-modifier-border)] bg-[var(--background-secondary)] flex items-center px-1 overflow-x-auto shrink-0 z-30 select-none shadow-md backdrop-blur-md"
    style="scrollbar-width: none; -ms-overflow-style: none;"
  >
    <div class="flex items-center gap-0.5">
      <!-- Command Palette -->
      <button
        @click.prevent="openCommandPalette"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--interactive-accent)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Command Palette"
        aria-label="Command Palette"
      >
        <Terminal class="w-4 h-4" />
      </button>

      <!-- Bold -->
      <button
        @click.prevent="formatSelection('**', '**')"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Bold"
        aria-label="Bold"
      >
        <Bold class="w-4 h-4" />
      </button>

      <!-- Italic -->
      <button
        @click.prevent="formatSelection('*', '*')"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Italic"
        aria-label="Italic"
      >
        <Italic class="w-4 h-4" />
      </button>

      <!-- Heading -->
      <button
        @click.prevent="insertLinePrefix('## ')"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Heading"
        aria-label="Heading"
      >
        <Heading class="w-4 h-4" />
      </button>

      <!-- Wikilink -->
      <button
        @click.prevent="formatSelection('[[', ']]')"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Insert Link"
        aria-label="Insert Link"
      >
        <Link class="w-4 h-4" />
      </button>

      <!-- Task Checkbox -->
      <button
        @click.prevent="toggleTask"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Toggle Task Checkbox"
        aria-label="Toggle Task Checkbox"
      >
        <CheckSquare class="w-4 h-4" />
      </button>

      <!-- Bullet List -->
      <button
        @click.prevent="insertLinePrefix('- ')"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Bullet List"
        aria-label="Bullet List"
      >
        <List class="w-4 h-4" />
      </button>

      <!-- Numbered List -->
      <button
        @click.prevent="insertLinePrefix('1. ')"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Numbered List"
        aria-label="Numbered List"
      >
        <ListOrdered class="w-4 h-4" />
      </button>

      <!-- Indent -->
      <button
        @click.prevent="indent(true)"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Indent"
        aria-label="Indent"
      >
        <Indent class="w-4 h-4" />
      </button>

      <!-- Outdent -->
      <button
        @click.prevent="indent(false)"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Outdent"
        aria-label="Outdent"
      >
        <Outdent class="w-4 h-4" />
      </button>

      <!-- Quote -->
      <button
        @click.prevent="insertLinePrefix('> ')"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Blockquote"
        aria-label="Blockquote"
      >
        <Quote class="w-4 h-4" />
      </button>

      <!-- Inline Code -->
      <button
        @click.prevent="formatSelection('`', '`')"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Inline Code"
        aria-label="Inline Code"
      >
        <Code class="w-4 h-4" />
      </button>

      <!-- Undo -->
      <button
        @click.prevent="undo"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-muted)] active:text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Undo"
        aria-label="Undo"
      >
        <Undo2 class="w-4 h-4" />
      </button>

      <!-- Redo -->
      <button
        @click.prevent="redo"
        class="min-w-[42px] min-h-[40px] flex items-center justify-center text-[var(--text-muted)] active:text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded transition-colors"
        title="Redo"
        aria-label="Redo"
      >
        <Redo2 class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.mobile-keyboard-toolbar::-webkit-scrollbar {
  display: none;
}
</style>
