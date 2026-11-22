# Identité visuelle GICA — rapport pour le design de la solution

Nov 21, 2026 · @tahar

## Ce qui est vérifié

La couleur de marque de GICA est un bleu profond, #04375D, sur fond blanc ; tout le reste se lit surtout dans la structure du site.

| Élément | Constat | Source |
| --- | --- | --- |
| Couleur de marque | #04375D (RVB 4, 55, 93), blanc en second ; #02395D apparaît aussi | Brandfetch, extraction automatique (marque « non revendiquée ») |
| Logo | Deux fichiers : `logodark` et `logogicalight` ; logotype « GICA » ; forme exacte non décrite | Page gica.dz |
| Imagerie | Photos réelles de sites industriels et de packagings produits, format WebP | Page gica.dz |
| Langues | Français, arabe, anglais (sélecteur dans la barre du haut) | Page gica.dz |
| Technologie | WordPress, Elementor, Slider Revolution | Métadonnées de la page |
| Ton | Institutionnel, français formel, libellés courts et descriptifs | Page gica.dz |

La couleur vient d'une source tierce automatique, pas d'une charte officielle : elle sert de point d'ancrage, à confirmer sur le site. SCAEK, l'usine étudiée dans la thèse, est une filiale de GICA et figure dans la chronologie du site.

## Ce qui n'est pas vérifié

Les polices, les couleurs secondaires et d'accent, le style des boutons, les rayons de coins et la gamme de gris sont inconnus : la page récupérée ne contient pas les styles, la feuille de style n'était pas accessible et Brandfetch bloque les requêtes automatiques.

Pour les relever en cinq minutes :

1. Ouvrir gica.dz dans Chrome.
2. Faire un clic droit sur un titre, un bouton et l'en-tête, puis choisir « Inspecter ».
3. Dans l'onglet « Calculé », noter `font-family`, `color`, `background-color` et `border-radius`.
4. Variante : installer les extensions WhatFont et ColorZilla et cliquer sur les éléments.
5. Variante : envoyer trois ou quatre captures (en-tête, une section, une carte, le pied de page) et les valeurs seront extraites à partir de là.

## Appliquer l'identité GICA à notre produit

La palette doit s'ancrer sur le bleu GICA #04375D ; elle remplace la proposition précédente en graphite neutre, qui ne ressemblait en rien au sponsor. Seule la première ligne ci-dessous est sourcée chez GICA : le reste est une proposition à valider.

| Rôle | Hex | Statut |
| --- | --- | --- |
| Bleu GICA (ancrage, en-têtes, boutons principaux) | `#04375D` | Sourcé (GICA) |
| Fond sombre, salle de contrôle | `#051A2A` | Proposé |
| Surface sombre | `#072840` | Proposé |
| Bordure sombre | `#1F4E73` | Proposé |
| Page, thème clair | `#FFFFFF` | Proposé |
| Surface, thème clair | `#F3F6F9` | Proposé |
| Cyan données (mesures en direct, sélection) | `#36C5D8` | Repris de la proposition précédente |
| Normal | `#43B982` | Repris de la proposition précédente |
| Avertissement | `#F2B84B` | Repris de la proposition précédente |
| Critique | `#F28C4B` | Repris de la proposition précédente |
| Urgence | `#E45F5F` | Repris de la proposition précédente |
| Arrêt planifié, hors ligne | `#7A8A96` | Repris de la proposition précédente |
| Agent IA | `#A78BFA` | Repris de la proposition précédente |

Le thème sombre sert aux écrans opérateur et supervision ; le thème clair sert aux rapports et à la vue spectateur. Aucune couleur d'état ne doit être le bleu de marque, pour que l'opérateur ne confonde pas marque et état, et chaque état garde un libellé et une icône en plus de sa couleur. Le contraste (WCAG AA, 4,5:1 pour le texte) reste à vérifier dans Figma.

## Motifs de mise en page à réutiliser

Les motifs du site GICA se transposent directement aux écrans opérateur et supervision, ce qui donne au jury une famille visuelle cohérente avec le sponsor.

| Élément du site GICA | Ce qu'on y voit | Réutilisation dans le produit |
| --- | --- | --- |
| Barre utilitaire | Filiales, Contact, Actualité, téléphone, e-mail, réseaux, sélecteur FR / AR / EN | Barre d'état : mode, connexion, utilisateur, langue |
| Navigation principale | Libellés en majuscules, menus déroulants titrés | Barre du haut et menu latéral en majuscules |
| Bandeau principal | Diaporama pleine largeur, titre en majuscules, quatre boutons | Vue d'ensemble du four avec grand visuel central |
| En-têtes de section | Petit libellé au-dessus d'un grand titre | En-tête de chaque panneau |
| Chiffres clés | Compteurs animés (collaborateurs, cimenteries, tonnes, filiales) | Cartes d'indicateurs : chaux libre estimée, énergie spécifique |
| Chronologie | Historique vertical de 2009 à 2024 | Chronologie d'audit de l'incident |
| Blocs numérotés | 01, 02, 03… avec une image | Étapes du cycle de vie : Détecté, Acquitté, Traité, Clôturé |
| Cartes d'actualité | Pastille jour-mois, catégorie, titre, extrait, lien | Cartes d'incident et de rapport |
| Pied de page | Logo clair, description, colonnes, contact, certifications | Pied de page des rapports générés |
| Trois langues | Français, arabe, anglais | Prévoir l'arabe en mise en page de droite à gauche dans le design system |

## Décision et prochaines étapes

Le guide de l'idéathon demande une « identité propre à votre solution » : la solution doit donc reprendre les couleurs de GICA mais garder son propre nom, son propre logo et ses propres icônes. Cela satisfait à la fois le lien avec le sponsor et la consigne du guide. Le logo et les photos de GICA ne sont pas à réutiliser.

1. Relever les polices et les couleurs d'accent sur gica.dz (section « Ce qui n'est pas vérifié »).
2. Valider la palette et ses contrastes dans Figma.
3. Choisir le nom définitif et dessiner le logo de la solution.
4. Construire les composants du design system à partir des motifs de mise en page ci-dessus.

## Sources

- [Page d'accueil de GICA](https://gica.dz/fr/) : page ouverte le 21 novembre 2026, source de la structure, du contenu et des motifs de mise en page.
- [Profil Brandfetch de gica.dz](https://brandfetch.com/gica.dz) : les couleurs viennent de l'extrait d'un résultat de recherche ; la page elle-même bloque les requêtes automatiques et n'a pas pu être ouverte.
