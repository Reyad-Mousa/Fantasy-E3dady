export type StageId = 'grade7' | 'grade8' | 'grade9';

export interface StageConfig {
  id: StageId;
  name: string;
  color: string;
}

export const STAGES: Record<StageId, StageConfig> = {
  grade7: {
    id: 'grade7',
    name: 'أولى إعدادي',
    color: '#6c63ff',
  },
  grade8: {
    id: 'grade8',
    name: 'تانية إعدادي',
    color: '#00d4aa',
  },
  grade9: {
    id: 'grade9',
    name: 'تالتة إعدادي',
    color: '#ff6b9d',
  },
};

export const STAGES_LIST = Object.values(STAGES);
