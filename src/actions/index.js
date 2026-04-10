'use strict';

const logger = require('../logger');

// ─── Action Registry ─────────────────────────────────────────

const actions = new Map();

/**
 * Register an action module.
 * Each action must export: { name, types: string[], run: (item, ctx) => Promise<string|null> }
 */
function register(actionModule) {
  if (!actionModule.name || !Array.isArray(actionModule.types) || typeof actionModule.run !== 'function') {
    /* istanbul ignore next */
    throw new Error(
      `Invalid action module: must have 'name' (string), 'types' (string[]), and 'run' (function)`,
    );
  }

  for (const type of actionModule.types) {
    actions.set(type, actionModule);
    logger.info({ action: actionModule.name, type }, 'Action registered');
  }
}

/**
 * Get action for a given item type.
 * @returns {Object|null} action module or null if no action registered for this type
 */
function getAction(type) {
  return actions.get(type) || null;
}

/**
 * Get all registered type → action mappings.
 */
function getRegisteredActions() {
  const result = {};
  for (const [type, action] of actions) {
    result[type] = action.name;
  }
  return result;
}

/**
 * Clear all (for testing).
 */
/* istanbul ignore next */
function clearActions() {
  actions.clear();
}

// ─── Auto-register built-in actions ──────────────────────────

register(require('./generate-comment'));
register(require('./generate-cover'));

module.exports = {
  register,
  getAction,
  getRegisteredActions,
  clearActions,
};
