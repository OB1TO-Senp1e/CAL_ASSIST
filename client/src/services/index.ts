import api from './api';

export const goalsAPI = {
  create: (data: any) => api.post('/api/goals', data),
  getAll: (params?: Record<string, any>) => api.get('/api/goals', { params }),
  getOne: (id: string) => api.get(`/api/goals/${id}`),
  getProgress: (id: string) => api.get(`/api/goals/${id}/progress`),
  update: (id: string, data: any) => api.patch(`/api/goals/${id}`, data),
  delete: (id: string) => api.delete(`/api/goals/${id}`),
  getStats: () => api.get('/api/goals/stats'),
};

export const tasksAPI = {
  create: (data: any) => api.post('/api/tasks', data),
  getAll: (params?: Record<string, any>) => api.get('/api/tasks', { params }),
  getOne: (id: string) => api.get(`/api/tasks/${id}`),
  update: (id: string, data: any) => api.patch(`/api/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/api/tasks/${id}`),
  getDependencies: (id: string) => api.get(`/api/tasks/${id}/dependencies`),
};

export const eventsAPI = {
  create: (data: any) => api.post('/api/events', data),
  getAll: (params?: Record<string, any>) => api.get('/api/events', { params }),
  getOne: (id: string) => api.get(`/api/events/${id}`),
  update: (id: string, data: any) => api.patch(`/api/events/${id}`, data),
  delete: (id: string) => api.delete(`/api/events/${id}`),
};

export const timeBlocksAPI = {
  create: (data: any) => api.post('/api/time-blocks', data),
  getAll: (params?: Record<string, any>) => api.get('/api/time-blocks', { params }),
  getOne: (id: string) => api.get(`/api/time-blocks/${id}`),
  update: (id: string, data: any) => api.patch(`/api/time-blocks/${id}`, data),
  delete: (id: string) => api.delete(`/api/time-blocks/${id}`),
};

export const aiAPI = {
  parseIntent: (text: string) => api.post('/api/ai/intent/parse', { text }),
  createPlan: (intent: any) => api.post('/api/ai/planning/from-intent', { intent }),
  decomposeGoal: (goalId: string) => api.post(`/api/ai/planning/decompose/${goalId}`),
};

export const schedulingAPI = {
  generateSchedule: (data: any) => api.post('/api/scheduling/generate', data),
  findAvailableSlots: (data: any) => api.post('/api/scheduling/available-slots', data),
  compileSchedule: (planId: string, timeBlocks: any[]) => api.post(`/api/scheduling/compile/${planId}`, { timeBlocks }),
};

export const realityAPI = {
  check: () => api.get('/api/reality/check'),
  taskRisk: (taskId: string) => api.get(`/api/reality/risk/${taskId}`),
};
