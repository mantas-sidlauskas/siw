'use strict';

module.exports = function createPlugin(server) {
  const plugin = {
    id: 'signalk-image-widgets',
    name: 'SignalK Image Widgets',
    description: 'Renders configured SignalK paths as raster images for simple/low-power displays.',
    start: () => {
      server.setPluginStatus('Started');
    },
    stop: () => {
      server.setPluginStatus('Stopped');
    },
    schema: () => ({ type: 'object', properties: {} }),
    registerWithRouter(router) {
      server.setPluginStatus('Providing image-rendered components');
    },
  };

  return plugin;
};
