Config = {}

-- Commande et touche pour ouvrir la tablette (la touche est modifiable par chaque joueur dans Paramètres > Raccourcis > FiveM)
Config.Command = 'tablette'
Config.Key = 'F5'

-- Nom affiché en haut de la tablette
Config.ServerName = 'GLife'

-- Animation + prop tablette dans les mains
Config.UseAnimation = true

-- Framework pour les restrictions par métier : 'auto', 'esx', 'qb' ou 'none'
Config.Framework = 'auto'

-- Permission ACE pour ajouter / modifier / supprimer des applis depuis la tablette en jeu
-- Dans ton server.cfg : add_ace group.admin glife.tablette.admin allow
Config.AdminAce = 'glife.tablette.admin'

--[[
    APPLICATIONS DE BASE
    Chaque appli affiche le site de l'entreprise dans la tablette.

    - id    : identifiant unique (sans espace)
    - label : nom affiché sous l'icône
    - url   : lien du site (https://...)
    - color : couleur de l'icône (#RRGGBB)
    - icon  : vide = initiales du nom ; sinon un lien d'image https
    - jobs  : nil = visible par tous ; sinon liste des métiers autorisés, ex : { 'bennys' }
]]
Config.Apps = {
    { id = 'casaverde', label = 'Casa Verde', color = '#1ed27a', icon = '', url = 'https://casaverdeglite.netlify.app/' },
    { id = 'ltdsud',    label = 'LTD Sud',    color = '#f28c28', icon = '', url = '' },
    { id = 'bennys',    label = "Benny's",    color = '#d4a72c', icon = '', url = '' },
}
