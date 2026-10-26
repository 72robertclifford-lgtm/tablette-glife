local isOpen = false
local customApps = {}
local hiddenSet = {}
local isAdmin = false
local tabletProp = nil

-- ===== Framework (métier du joueur) =====
local ESX, QBCore = nil, nil

CreateThread(function()
    local fw = Config.Framework
    if (fw == 'auto' or fw == 'esx') and GetResourceState('es_extended') == 'started' then
        local ok, obj = pcall(function() return exports['es_extended']:getSharedObject() end)
        if ok then ESX = obj end
    end
    if not ESX and (fw == 'auto' or fw == 'qb') and GetResourceState('qb-core') == 'started' then
        local ok, obj = pcall(function() return exports['qb-core']:GetCoreObject() end)
        if ok then QBCore = obj end
    end
end)

local function getJob()
    if ESX then
        local data = ESX.GetPlayerData()
        return data and data.job and data.job.name or nil
    elseif QBCore then
        local data = QBCore.Functions.GetPlayerData()
        return data and data.job and data.job.name or nil
    end
    return nil
end

local function canSee(app, job)
    if not app.jobs or #app.jobs == 0 then return true end
    if not ESX and not QBCore then return true end -- pas de framework : tout le monde voit tout
    if isAdmin then return true end
    for _, j in ipairs(app.jobs) do
        if j == job then return true end
    end
    return false
end

local function buildAppList()
    local job = getJob()
    local list = {}
    for _, app in ipairs(Config.Apps) do
        if canSee(app, job) then
            local a = {}
            for k, v in pairs(app) do a[k] = v end
            a.builtin = true
            a.hidden = hiddenSet[app.id] == true
            list[#list + 1] = a
        end
    end
    for _, app in ipairs(customApps) do
        if canSee(app, job) then list[#list + 1] = app end
    end
    return list
end

-- ===== Animation =====
local function startAnim()
    if not Config.UseAnimation then return end
    local ped = PlayerPedId()
    local dict, anim, model = 'amb@code_human_in_bus_passenger_idles@female@tablet@base', 'base', `prop_cs_tablet`

    RequestAnimDict(dict)
    RequestModel(model)
    local timeout = GetGameTimer() + 3000
    while (not HasAnimDictLoaded(dict) or not HasModelLoaded(model)) and GetGameTimer() < timeout do Wait(10) end

    tabletProp = CreateObject(model, 0.0, 0.0, 0.0, true, true, false)
    AttachEntityToEntity(tabletProp, ped, GetPedBoneIndex(ped, 60309), 0.03, 0.002, -0.0, 10.0, 160.0, 0.0, true, false, false, false, 2, true)
    TaskPlayAnim(ped, dict, anim, 3.0, 3.0, -1, 49, 0, false, false, false)
    SetModelAsNoLongerNeeded(model)
end

local function stopAnim()
    if not Config.UseAnimation then return end
    local ped = PlayerPedId()
    StopAnimTask(ped, 'amb@code_human_in_bus_passenger_idles@female@tablet@base', 'base', 1.0)
    if tabletProp and DoesEntityExist(tabletProp) then
        DeleteEntity(tabletProp)
    end
    tabletProp = nil
end

-- ===== Ouverture / fermeture =====
local function openTablet()
    if isOpen then return end
    if IsPedDeadOrDying(PlayerPedId(), true) then return end
    isOpen = true
    TriggerServerEvent('glife_tablette:requestApps')
    SetNuiFocus(true, true)
    SendNUIMessage({
        action = 'open',
        serverName = Config.ServerName,
        apps = buildAppList(),
        isAdmin = isAdmin,
    })
    startAnim()
end

local function closeTablet()
    if not isOpen then return end
    isOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
    stopAnim()
end

RegisterCommand(Config.Command, function()
    if isOpen then closeTablet() else openTablet() end
end, false)
RegisterKeyMapping(Config.Command, 'Ouvrir la tablette ' .. Config.ServerName, 'keyboard', Config.Key)

-- ===== Événements serveur =====
RegisterNetEvent('glife_tablette:apps', function(apps, admin, hidden)
    customApps = apps or {}
    if hidden then
        hiddenSet = {}
        for _, id in ipairs(hidden) do hiddenSet[id] = true end
    end
    if admin ~= nil then isAdmin = admin end
    if isOpen then
        SendNUIMessage({ action = 'apps', apps = buildAppList(), isAdmin = isAdmin })
    end
end)

RegisterNetEvent('glife_tablette:notify', function(msg)
    if isOpen then
        SendNUIMessage({ action = 'toast', message = msg })
    else
        BeginTextCommandThefeedPost('STRING')
        AddTextComponentSubstringPlayerName(msg)
        EndTextCommandThefeedPostTicker(false, true)
    end
end)

-- ===== Callbacks NUI =====
RegisterNUICallback('close', function(_, cb)
    closeTablet()
    cb('ok')
end)

RegisterNUICallback('login', function(data, cb)
    if data and type(data.password) == 'string' then
        TriggerServerEvent('glife_tablette:login', data.password)
    end
    cb('ok')
end)

RegisterNUICallback('logout', function(_, cb)
    TriggerServerEvent('glife_tablette:logout')
    cb('ok')
end)

RegisterNetEvent('glife_tablette:loginResult', function(ok, message)
    if ok then isAdmin = true end
    SendNUIMessage({ action = 'loginResult', ok = ok, message = message })
end)

RegisterNUICallback('addApp', function(data, cb)
    if isAdmin then TriggerServerEvent('glife_tablette:addApp', data) end
    cb('ok')
end)

RegisterNUICallback('editApp', function(data, cb)
    if isAdmin then TriggerServerEvent('glife_tablette:editApp', data) end
    cb('ok')
end)

RegisterNUICallback('hideApp', function(data, cb)
    if isAdmin and data and data.id then TriggerServerEvent('glife_tablette:hideApp', data.id, data.hide == true) end
    cb('ok')
end)

RegisterNUICallback('removeApp', function(data, cb)
    if isAdmin and data and data.id then TriggerServerEvent('glife_tablette:removeApp', data.id) end
    cb('ok')
end)

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() then
        if isOpen then SetNuiFocus(false, false) end
        stopAnim()
    end
end)

CreateThread(function()
    Wait(2000)
    TriggerServerEvent('glife_tablette:requestApps')
end)
