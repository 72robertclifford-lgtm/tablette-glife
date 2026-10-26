# Tablette GLife

Tablette du serveur GLife : chaque appli ouvre le site d'une entreprise en plein écran.
La liste des applis est stockée sur un Cloudflare Worker : un ajout ou une suppression
depuis l'espace admin est **définitif** et **visible par tout le monde**.

## Mise en route du serveur des applis (une seule fois, ~5 min)

1. Sur **dash.cloudflare.com** → **Storage & Databases** → **KV** → **Create** : nomme-le `tablette-glife-apps`.
2. **Workers & Pages** → **Create** → **Create Worker** → nomme-le `tablette-glife-api` → **Deploy**.
3. **Edit code** : remplace tout par le contenu de `worker/worker.js` → **Deploy**.
4. Dans le Worker → **Settings** :
   - **Bindings** → **Add** → **KV namespace** : nom de variable `APPS_KV`, espace `tablette-glife-apps`.
   - **Variables and Secrets** → **Add** → type **Secret**, nom `ADMIN_PASSWORD`, valeur : ton mot de passe admin.
5. Copie l'adresse du Worker (ex. `https://tablette-glife-api.ton-compte.workers.dev`)
   et colle-la dans `index.html` à la place de `REMPLACE_PAR_L_URL_DU_WORKER`.

Le mot de passe n'est jamais dans le code du site : c'est le Worker qui le vérifie
(5 essais ratés = blocage d'une minute).

## Utilisation
Bouton **Admin** sur l'accueil → mot de passe → **Gestion des applis** : ajouter, modifier, supprimer.
Les autres visiteurs voient les changements en moins de 20 secondes, sans recharger la page.

## Ressource FiveM (dossier `fivem/`)
Copie le dossier `fivem` dans `resources/` sous le nom `glife_tablette`, puis :
1. copie `server_config.example.lua` en `server_config.lua` et mets ton mot de passe admin ;
2. ajoute `ensure glife_tablette` dans `server.cfg`.
En jeu : touche **F5** ou `/tablette`.
