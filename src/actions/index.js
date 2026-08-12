'use strict';

const logger = require('../logger');

const actions = new Map();

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

function getAction(type) {
  return actions.get(type) || null;
}

function getRegisteredActions() {
  const result = {};
  for (const [type, action] of actions) {
    result[type] = action.name;
  }
  return result;
}

/* istanbul ignore next */
function clearActions() {
  actions.clear();
}

register(require('./generate-comment'));
register(require('./generate-cover'));

module.exports = {
  register,
  getAction,
  getRegisteredActions,
  clearActions,
};
