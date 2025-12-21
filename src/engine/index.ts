/**
 * ActionEngine - Public API
 * 
 * This is the ONLY entry point for domain operations.
 * UI and Assistant MUST use these exports.
 */

export {
  // Create operations
  createTask,
  createEvent,
  recordExpense,
  
  // Query operations
  queryTasks,
  queryEvents,
  queryExpenses,
  
  // Types
  type ActionResult,
  type ActionError,
  type CreateTaskInput,
  type CreateEventInput,
  type CreateExpenseInput,
  type TaskFilters,
  type EventFilters,
  type ExpenseFilters
} from './ActionEngine';
