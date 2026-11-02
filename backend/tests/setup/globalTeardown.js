'use strict';

module.exports = async () => {
  if (globalThis.__MONGO_LITE__) await globalThis.__MONGO_LITE__.close();
};
