import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ 
            data: { id: 'test-id', title: 'Test Task' }, 
            error: null 
          }))
        }))
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          gte: vi.fn(() => ({
            lte: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
              }))
            }))
          }))
        }))
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null }))
        }))
      }))
    }))
  }
}));

// Import after mocking
import { 
  createTask, 
  createEvent, 
  recordExpense,
  queryTasks,
  deleteTask
} from '@/engine/ActionEngine';

describe('ActionEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTask', () => {
    it('should fail without user_id', async () => {
      const result = await createTask({ 
        user_id: '', 
        title: 'Test' 
      });
      
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.type).toBe('VALIDATION_ERROR');
      expect(result.success === false && result.error.missing_fields).toContain('user_id');
    });

    it('should fail without title', async () => {
      const result = await createTask({ 
        user_id: 'user-123', 
        title: '' 
      });
      
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.type).toBe('VALIDATION_ERROR');
      expect(result.success === false && result.error.missing_fields).toContain('title');
    });

    it('should fail with whitespace-only title', async () => {
      const result = await createTask({ 
        user_id: 'user-123', 
        title: '   ' 
      });
      
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.missing_fields).toContain('title');
    });

    it('should succeed with valid input', async () => {
      const result = await createTask({ 
        user_id: 'user-123', 
        title: 'Valid Task' 
      });
      
      expect(result.success).toBe(true);
      expect(result.success === true && result.data).toBeDefined();
    });
  });

  describe('createEvent', () => {
    it('should fail without required fields', async () => {
      const result = await createEvent({ 
        user_id: '', 
        title: '',
        date: ''
      });
      
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.type).toBe('VALIDATION_ERROR');
      expect(result.success === false && result.error.missing_fields).toContain('user_id');
      expect(result.success === false && result.error.missing_fields).toContain('title');
      expect(result.success === false && result.error.missing_fields).toContain('date');
    });

    it('should succeed with valid input', async () => {
      const result = await createEvent({ 
        user_id: 'user-123', 
        title: 'Meeting',
        date: '2026-01-25'
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('recordExpense', () => {
    it('should fail without amount', async () => {
      const result = await recordExpense({ 
        user_id: 'user-123', 
        amount: 0,
        category: 'food'
      });
      
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.missing_fields).toContain('amount');
    });

    it('should fail with negative amount', async () => {
      const result = await recordExpense({ 
        user_id: 'user-123', 
        amount: -10,
        category: 'food'
      });
      
      expect(result.success).toBe(false);
    });

    it('should fail without category', async () => {
      const result = await recordExpense({ 
        user_id: 'user-123', 
        amount: 10,
        category: ''
      });
      
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.missing_fields).toContain('category');
    });

    it('should succeed with valid input', async () => {
      const result = await recordExpense({ 
        user_id: 'user-123', 
        amount: 25.50,
        category: 'food'
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('queryTasks', () => {
    it('should fail without user_id', async () => {
      const result = await queryTasks('');
      
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.missing_fields).toContain('user_id');
    });

    it('should return empty array for valid user with no tasks', async () => {
      const result = await queryTasks('user-123');
      
      expect(result.success).toBe(true);
      expect(result.success === true && Array.isArray(result.data)).toBe(true);
    });
  });

  describe('deleteTask', () => {
    it('should fail without user_id or task_id', async () => {
      const result = await deleteTask('', '');
      
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.type).toBe('VALIDATION_ERROR');
    });

    it('should succeed with valid ids', async () => {
      const result = await deleteTask('user-123', 'task-456');
      
      expect(result.success).toBe(true);
    });
  });
});
