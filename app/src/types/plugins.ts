export interface DailyNotesSettings {
  folder: string;
  format: string; // e.g. "YYYY-MM-DD"
  template: string;
  openOnStartup: boolean;
}

export interface TemplatesSettings {
  folder: string;
  dateFormat: string;
  timeFormat: string;
}

export interface FileRecoverySettings {
  intervalMinutes: number;
  historyDurationDays: number;
}

export interface ZkPrefixerSettings {
  folder: string;
  format: string; // e.g. "YYYYMMDDHHmm"
  template: string;
}

export interface CorePluginDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  hasSettings?: boolean;
  icon?: string;
}

export interface RecoverySnapshot {
  id: string;
  filePath: string;
  timestamp: number;
  content: string;
  sizeBytes: number;
}
