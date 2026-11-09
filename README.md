# Extension Chrome - Traducteur Kirundi

Extension Chrome pour traduire automatiquement des phrases du francais vers le kirundi via Google Translate, par lots de 90 phrases.

## Fonctionnalites

- **Upload JSON** : Charge un fichier JSON contenant les phrases en francais
- **Traduction par lots** : Envoie les phrases par blocs de 90 (configurable)
- **Detection automatique** : Attend que la traduction Google soit prete
- **Pause / Reprendre** : Interrompt et reprend la traduction a tout moment
- **Sauvegarde automatique** : Sauvegarde la progression dans le stockage Chrome
- **Export JSON** : Exporte le resultat a tout moment, meme partiel
- **Journal en temps reel** : Affiche les logs de la traduction

## Format du fichier JSON d'entree

```json
{
  "phrases": [
    "Bonjour, comment allez-vous ?",
    "Je voudrais un verre d'eau",
    "Ou se trouve la gare ?",
    "..."
  ]
}
```

Le fichier peut aussi etre un simple tableau JSON :
```json
[
  "Phrase 1",
  "Phrase 2",
  "Phrase 3"
]
```

## Format du fichier JSON de sortie

```json
[
  {
    "id": 1,
    "fr": "Bonjour, comment allez-vous ?",
    "rn": "Bonjour, comment allez-vous ? (traduit en kirundi)"
  },
  {
    "id": 2,
    "fr": "Je voudrais un verre d'eau",
    "rn": "..."
  }
]
```

## Installation

1. Ouvrir Chrome et aller sur `chrome://extensions/`
2. Activer le "Mode developpeur" (bouton en haut a droite)
3. Cliquer sur "Charger l'extension non empaquetee"
4. Selectionner le dossier `extension-traducteur-kirundi/`
5. L'extension apparait dans la barre d'outils Chrome

## Utilisation

1. Cliquer sur l'icone de l'extension dans la barre Chrome
2. Charger le fichier JSON contenant les phrases
3. Configurer la taille du lot (par defaut : 90) et le delai (par defaut : 3.5s)
4. Cliquer sur "Demarrer"
5. L'extension ouvre automatiquement Google Translate (fr -> kirundi)
6. La traduction se fait automatiquement, lot par lot
7. On peut mettre en pause/reprendre a tout moment
8. Exporter le resultat quand on veut

## Configuration

- **Taille du lot** : Nombre de phrases par envoi (1-500, defaut : 90)
- **Delai** : Temps d'attente entre chaque lot en secondes (1-30, defaut : 3.5)

## Selecteurs DOM utilises

L'extension utilise les selecteurs suivants sur Google Translate :
- **Source** : `textarea[jsname="BJE2fc"]`
- **Traduction** : `span[jsname="W297wb"]`

## Notes

- Ne pas fermer l'onglet Google Translate pendant la traduction
- La sauvegarde automatique permet de reprendre meme apres fermeture du popup
- L'export partiel permet de recuperer les traductions deja faites a tout moment
- Google Translate a une limite de caracteres par requete, d'ou l'interet des lots