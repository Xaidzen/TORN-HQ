const config = require('./config');
const logger = require('./logger');

function parseServices() {
  const servicesStr = process.env.SERVICES || '';
  return servicesStr.split(',').map(s => s.trim()).filter(s => s);
}

function parseServiceChannels() {
  const channelsStr = process.env.SERVICE_CHANNELS || '';
  const result = {};

  channelsStr.split(',').forEach(pair => {
    const [service, channelId] = pair.split(':').map(s => s.trim());
    if (service && channelId) {
      result[channelId] = service;
    }
  });

  return result;
}

function parseServiceRoles() {
  const rolesStr = process.env.SERVICE_ROLES || '';
  const result = {};

  rolesStr.split(',').forEach(pair => {
    const [service, roleId] = pair.split(':').map(s => s.trim());
    if (service && roleId) {
      result[service] = roleId;
    }
  });

  return result;
}

function getServiceTypeFromChannel(channelId) {
  const channelMap = parseServiceChannels();
  return channelMap[channelId] || null;
}

function getRoleIdFromService(serviceType) {
  const roleMap = parseServiceRoles();
  return roleMap[serviceType] || null;
}

function parseServiceRoleNames() {
  const roleNamesStr = process.env.SERVICE_ROLENAMES || '';
  const services = parseServices();
  const result = {};

  roleNamesStr.split(',').forEach((roleName, index) => {
    if (index < services.length) {
      result[services[index]] = roleName.trim();
    }
  });

  return result;
}

function getServiceOptions() {
  const services = parseServices();
  const roleNames = parseServiceRoleNames();

  return services.map(service => ({
    name: roleNames[service] || service.charAt(0).toUpperCase() + service.slice(1),
    value: service,
    description: roleNames[service] || `${service.charAt(0).toUpperCase() + service.slice(1)} service`
  }));
}

module.exports = {
  parseServices,
  parseServiceChannels,
  parseServiceRoles,
  parseServiceRoleNames,
  getServiceTypeFromChannel,
  getRoleIdFromService,
  getServiceOptions
};
