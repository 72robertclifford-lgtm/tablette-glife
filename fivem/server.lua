local RESOURCE = GetCurrentResourceName()
local FILE = 'data/apps.json'
local customApps = {}
local HIDDEN_FILE = 'data/hidden.json'
local hiddenApps = {} -- applis de config.lua supprimées depuis la tablette (liste d'id)

local function trim(s)
    return (tostring(s or ''):gsub('^%s+', ''):gsub('%s+$', ''))
end

-- Garde seulement nom, lien, couleur, icône (convertit aussi les anciennes applis)
local function migrate(app)
    local url = app.url
    if (not url or url == '') and type(app.urls) == 'table' then url = app.urls[1] end
    return {
        id = app.id,
        label = app.label,
        url = url or '',
        color = app.color,
        icon = app.icon or '',
        jobs = app.jobs,
    }
end

local function loadApps()
    local raw = LoadResourceFile(RESOURCE, FILE)
    local ok, data = pcall(json.decode, raw or '[]')
    customApps = (ok and type(data) == 'table') and data or {}
    for i, app in ipairs(customApps) do customApps[i] = migrate(app) end
    print(('[glife_tablette] %d application(s) ajoutée(s) en jeu chargée(s).'):format(#customApps))
    local okH, h = pcall(json.decode, LoadResourceFile(RESOURCE, HIDDEN_FILE) or '[]')
    hiddenApps = (okH and type(h) == 'table') and h or {}
end

local function saveApps()
    SaveResourceFile(RESOURCE, FILE, json.encode(customApps, { indent = true }), -1)
end

-- Joueurs connectés à l'espace admin avec le mot de passe (jusqu'à déconnexion)
local adminSessions = {}
local attempts = {}

local function isAdmin(src)
    return adminSessions[src] == true or IsPlayerAceAllowed(src, Config.AdminAce)
end

local function notify(src, msg)
    TriggerClientEvent('glife_tablette:notify', src, msg)
end

local function broadcast()
    TriggerClientEvent('glife_tablette:apps', -1, customApps, nil, hiddenApps)
end

local function sanitize(app)
    if type(app) ~= 'table' then return nil, 'Données invalides.' end

    local label = trim(app.label)
    local len = utf8.len(label) or #label
    if len < 1 or len > 24 then return nil, 'Le nom doit faire entre 1 et 24 caractères.' end

    local url = trim(app.url)
    if not url:match('^https?://') then return nil, 'Le lien doit commencer par http:// ou https://' end
    if #url > 500 then return nil, 'Lien trop long.' end

    local color = trim(app.color)
    if not color:match('^#%x%x%x%x%x%x$') then color = '#1ed27a' end

    local icon = trim(app.icon)
    if icon ~= '' and (not icon:match('^https?://') or #icon > 500) then icon = '' end

    return { label = label, url = url, color = color, icon = icon }
end

local function findApp(id)
    for i, app in ipairs(customApps) do
        if app.id == id then return i, app end
    end
end

RegisterNetEvent('glife_tablette:login', function(password)
    local src = source
    local now = os.time()
    local a = attempts[src] or { count = 0, lockUntil = 0 }
    attempts[src] = a

    if a.lockUntil > now then
        TriggerClientEvent('glife_tablette:loginResult', src, false, ('Trop d\'essais. Réessaie dans %d s.'):format(a.lockUntil - now))
        return
    end

    if type(password) == 'string' and password == ServerConfig.AdminPassword then
        a.count = 0
        adminSessions[src] = true
        TriggerClientEvent('glife_tablette:loginResult', src, true)
        TriggerClientEvent('glife_tablette:apps', src, customApps, true, hiddenApps)
        print(('[glife_tablette] %s s\'est connecté à l\'espace admin'):format(GetPlayerName(src)))
    else
        a.count = a.count + 1
        if a.count >= ServerConfig.MaxAttempts then
            a.count = 0
            a.lockUntil = now + ServerConfig.LockSeconds
            print(('[glife_tablette] %s bloqué après trop de mots de passe faux'):format(GetPlayerName(src)))
            TriggerClientEvent('glife_tablette:loginResult', src, false, ('Trop d\'essais. Réessaie dans %d s.'):format(ServerConfig.LockSeconds))
        else
            TriggerClientEvent('glife_tablette:loginResult', src, false, 'Mot de passe incorrect.')
        end
    end
end)

RegisterNetEvent('glife_tablette:logout', function()
    local src = source
    adminSessions[src] = nil
    TriggerClientEvent('glife_tablette:apps', src, customApps, isAdmin(src), hiddenApps)
end)

AddEventHandler('playerDropped', function()
    adminSessions[source] = nil
    attempts[source] = nil
end)

AddEventHandler('onResourceStart', function(res)
    if res == RESOURCE then loadApps() end
end)

RegisterNetEvent('glife_tablette:requestApps', function()
    local src = source
    TriggerClientEvent('glife_tablette:apps', src, customApps, isAdmin(src), hiddenApps)
end)

RegisterNetEvent('glife_tablette:addApp', function(app)
    local src = source
    if not isAdmin(src) then return end

    local clean, err = sanitize(app)
    if not clean then return notify(src, err) end

    clean.id = ('custom_%d%d'):format(os.time(), math.random(100, 999))
    customApps[#customApps + 1] = clean
    saveApps()
    broadcast()
    notify(src, ('Application « %s » ajoutée.'):format(clean.label))
    print(('[glife_tablette] %s a ajouté l\'appli %s'):format(GetPlayerName(src), clean.label))
end)

RegisterNetEvent('glife_tablette:editApp', function(app)
    local src = source
    if not isAdmin(src) or type(app) ~= 'table' or type(app.id) ~= 'string' then return end

    local index, old = findApp(app.id)
    if not index then return notify(src, 'Cette application n\'existe plus.') end

    local clean, err = sanitize(app)
    if not clean then return notify(src, err) end

    clean.id = app.id
    clean.jobs = old.jobs
    customApps[index] = clean
    saveApps()
    broadcast()
    notify(src, ('Application « %s » modifiée.'):format(clean.label))
end)

-- Supprimer / restaurer une appli de config.lua (elle est masquée pour tout le monde)
RegisterNetEvent('glife_tablette:hideApp', function(id, hide)
    local src = source
    if not isAdmin(src) or type(id) ~= 'string' then return end
    local known = false
    for _, app in ipairs(Config.Apps) do if app.id == id then known = app end end
    if not known then return end
    for i = #hiddenApps, 1, -1 do if hiddenApps[i] == id then table.remove(hiddenApps, i) end end
    if hide then hiddenApps[#hiddenApps + 1] = id end
    SaveResourceFile(RESOURCE, HIDDEN_FILE, json.encode(hiddenApps), -1)
    broadcast()
    notify(src, ('Application « %s » %s.'):format(known.label, hide and 'supprimée' or 'restaurée'))
end)

RegisterNetEvent('glife_tablette:removeApp', function(id)
    local src = source
    if not isAdmin(src) or type(id) ~= 'string' then return end

    local index, app = findApp(id)
    if not index then return end

    table.remove(customApps, index)
    saveApps()
    broadcast()
    notify(src, ('Application « %s » supprimée.'):format(app.label))
end)
