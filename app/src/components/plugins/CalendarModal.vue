<script setup lang="ts">
import { ref, computed } from 'vue';
import { useVaultStore } from '../../stores/vault';
import { openOrCreateDailyNote, getDailyNotePath } from '../../services/dailyNotes';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const vault = useVaultStore();

const viewDate = ref(new Date());

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const currentMonthLabel = computed(() => {
  return `${monthNames[viewDate.value.getMonth()]} ${viewDate.value.getFullYear()}`;
});

const today = new Date();
const isToday = (d: Date) => {
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
};

// Generate calendar cells (including padding from prev/next month)
interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  dayNum: number;
  hasNote: boolean;
  path: string;
}

const calendarDays = computed<CalendarDay[]>(() => {
  const year = viewDate.value.getFullYear();
  const month = viewDate.value.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days: CalendarDay[] = [];

  // Previous month padding
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, daysInPrevMonth - i);
    const path = getDailyNotePath(d);
    const hasNote = vault.allFilePaths.some((p) => p.toLowerCase() === path.toLowerCase());
    days.push({
      date: d,
      isCurrentMonth: false,
      dayNum: d.getDate(),
      hasNote,
      path,
    });
  }

  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const path = getDailyNotePath(d);
    const hasNote = vault.allFilePaths.some((p) => p.toLowerCase() === path.toLowerCase());
    days.push({
      date: d,
      isCurrentMonth: true,
      dayNum: i,
      hasNote,
      path,
    });
  }

  // Next month padding to fill grid
  const remaining = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    const path = getDailyNotePath(d);
    const hasNote = vault.allFilePaths.some((p) => p.toLowerCase() === path.toLowerCase());
    days.push({
      date: d,
      isCurrentMonth: false,
      dayNum: i,
      hasNote,
      path,
    });
  }

  return days;
});

function prevMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() - 1, 1);
}

function nextMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() + 1, 1);
}

function goToday() {
  viewDate.value = new Date();
}

async function handleDayClick(day: CalendarDay) {
  await openOrCreateDailyNote(day.date);
  emit('close');
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150"
    @click.self="$emit('close')"
  >
    <div class="bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded-xl shadow-2xl w-full max-w-sm overflow-hidden text-[var(--text-normal)]">
      <!-- Header -->
      <div class="p-3 border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary)] flex items-center justify-between">
        <div class="flex items-center gap-2 font-semibold text-xs text-[var(--text-accent)]">
          <CalendarIcon class="w-4 h-4" />
          <span>Calendar & Daily Notes</span>
        </div>
        <button
          @click="$emit('close')"
          class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Month Navigation -->
      <div class="p-3 flex items-center justify-between border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary-alt)]">
        <div class="font-semibold text-xs">{{ currentMonthLabel }}</div>
        <div class="flex items-center gap-1">
          <button
            @click="goToday"
            class="px-2 py-0.5 rounded text-[11px] bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] hover:bg-[var(--background-modifier-hover)] text-[var(--text-normal)] transition-colors"
          >
            Today
          </button>
          <button
            @click="prevMonth"
            class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
          >
            <ChevronLeft class="w-3.5 h-3.5" />
          </button>
          <button
            @click="nextMonth"
            class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
          >
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Day Names Header -->
      <div class="grid grid-cols-7 gap-1 p-2 text-center text-[10px] font-semibold text-[var(--text-muted)] border-b border-[var(--background-modifier-border)]">
        <div v-for="d in dayNames" :key="d">{{ d }}</div>
      </div>

      <!-- Days Grid -->
      <div class="grid grid-cols-7 gap-1 p-3 text-xs">
        <div
          v-for="(day, idx) in calendarDays"
          :key="idx"
          @click="handleDayClick(day)"
          class="h-8 flex flex-col items-center justify-center rounded cursor-pointer transition-all relative group"
          :class="[
            !day.isCurrentMonth ? 'text-[var(--text-faint)] opacity-40' : 'text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]',
            isToday(day.date) ? 'ring-1 ring-[var(--interactive-accent)] font-bold text-[var(--text-accent)] bg-[var(--interactive-accent)]/10' : '',
          ]"
        >
          <span>{{ day.dayNum }}</span>
          <!-- Dot for existing note -->
          <span
            v-if="day.hasNote"
            class="w-1.5 h-1.5 rounded-full bg-[var(--interactive-accent)] absolute bottom-1"
          ></span>
        </div>
      </div>

      <!-- Footer Quick Action -->
      <div class="p-2.5 bg-[var(--background-secondary)] border-t border-[var(--background-modifier-border)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-[var(--interactive-accent)]"></span>
          <span>Notes exist for dotted dates</span>
        </span>
        <button
          @click="handleDayClick({ date: new Date(), isCurrentMonth: true, dayNum: today.getDate(), hasNote: true, path: '' })"
          class="text-[var(--text-accent)] hover:underline font-medium"
        >
          Open Today's Note
        </button>
      </div>
    </div>
  </div>
</template>
