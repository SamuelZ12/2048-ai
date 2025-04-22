window.fakeStorage = {
  _data: {},

  setItem: function (id, val) {
    return this._data[id] = String(val);
  },

  getItem: function (id) {
    return this._data.hasOwnProperty(id) ? this._data[id] : undefined;
  },

  removeItem: function (id) {
    return delete this._data[id];
  },

  clear: function () {
    return this._data = {};
  }
};

function LocalStorageManager() {
  this.bestScoreKey     = "bestScore";
  this.botBestScoreKey  = "botBestScore";
  this.randomBestScoreKey = "randomBestScore";
  this.gameStateKey     = "gameState";

  var supported = this.localStorageSupported();
  this.storage = supported ? window.localStorage : window.fakeStorage;
}

LocalStorageManager.prototype.localStorageSupported = function () {
  var testKey = "test";

  try {
    var storage = window.localStorage;
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
};

// Best score getters/setters
LocalStorageManager.prototype.getBestScore = function () {
  return parseInt(this.storage.getItem(this.bestScoreKey) || 0, 10);
};

LocalStorageManager.prototype.setBestScore = function (score) {
  this.storage.setItem(this.bestScoreKey, score);
};

// Bot best score getters/setters
LocalStorageManager.prototype.getBotBestScore = function () {
  return parseInt(this.storage.getItem(this.botBestScoreKey) || 0, 10);
};

LocalStorageManager.prototype.setBotBestScore = function (score) {
  this.storage.setItem(this.botBestScoreKey, score);
};

// Random best score getters/setters
LocalStorageManager.prototype.getRandomBestScore = function () {
  return parseInt(this.storage.getItem(this.randomBestScoreKey) || 0, 10);
};

LocalStorageManager.prototype.setRandomBestScore = function (score) {
  this.storage.setItem(this.randomBestScoreKey, score);
};

// Game state getters/setters and clearing
LocalStorageManager.prototype.getGameState = function () {
  var stateJSON = this.storage.getItem(this.gameStateKey);
  return stateJSON ? JSON.parse(stateJSON) : null;
};

LocalStorageManager.prototype.setGameState = function (gameState) {
  this.storage.setItem(this.gameStateKey, JSON.stringify(gameState));
};

LocalStorageManager.prototype.clearGameState = function () {
  this.storage.removeItem(this.gameStateKey);
};
