// permissions.js
export const PERMISSIONS = {
    PRODUCTS: {
        VIEW: "products:view",
        CREATE: "products:create",
        UPDATE: "products:update",
        DELETE: "products:delete",
        IMPORT: "products:import",
        EXPORT: "products:export",
    },
    ORDERS: {
        VIEW: "orders:view",
        UPDATE: "orders:update",
        CANCEL: "orders:cancel",
        REFUND: "orders:refund",
    },
    USERS: {
        VIEW: "users:view",
        CREATE: "users:create",
        UPDATE: "users:update",
        DELETE: "users:delete",
    },
    CUSTOMERS: {
        VIEW: "customers:view",
        UPDATE: "customers:update",
        DELETE: "customers:delete",
    },
    ADMINS: {
        VIEW: "admins:view",
        CREATE: "admins:create",
        UPDATE: "admins:update",
        DELETE: "admins:delete",
        ASSIGN_ROLES: "admins:assignRoles",
    },
    PROMOTIONS: {
        VIEW: "promotions:view",
        CREATE: "promotions:create",
        UPDATE: "promotions:update",
        DELETE: "promotions:delete",
    },
    INVENTORY: {
        VIEW: "inventory:view",
        UPDATE: "inventory:update",
    },
    FINANCE: {
        VIEW: "finance:view",
        EXPORT: "finance:export",
        UPDATE: "finance:update",
    },
    REPORTS: {
        VIEW: "reports:view",
        EXPORT: "reports:export",
    },
    SETTINGS: {
        ROLES: "settings:roles",
        GENERAL: "settings:general",
    },
    ANALYTICS: {
        VIEW: "analytics:view",
        EXPORT: "analytics:export",
    }
};

// Flatten all permissions into an array for validation
export const ALL_PERMISSIONS = Object.values(PERMISSIONS).flatMap(module => Object.values(module));
