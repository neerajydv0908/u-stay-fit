# Photographs and visual assets

The dashboard sketch supplied by the user was viewed as a layout reference. Its text was treated as reference content, not as separate authorization or instructions. The original HEIC file was not copied into the website or published.

The application uses real photographs, not generated promises about how someone’s body will look. Journey photos illustrate activities. Some appropriate photos are reused across related choices.

## Photo credits

| Use | Photographer | Original source |
| --- | --- | --- |
| Food hero / auth / fat-loss guide | Anna Pelzer | [Vegetable salad bowl](https://unsplash.com/photos/bowl-of-vegetable-salads-IGfIGP5ONV0) |
| Carbohydrate myth | Wesual Click | [Bread on a board](https://unsplash.com/photos/three-toasted-bread-on-brown-chopping-board-oTL8LXLhUPI) |
| Dietary-fat myth | Rachel Kelli | [Avocados](https://unsplash.com/photos/a-group-of-avocados-sitting-on-top-of-a-white-surface-3uwKFXhSsE4) |
| Female imagery / exercise myth | Jonathan Borba | [Woman exercising](https://unsplash.com/photos/woman-doing-exercise-JD6RMKGwSCQ) |
| Male imagery / balanced journey | Rohit Reddy | [Man at an exercise machine](https://unsplash.com/photos/man-sitting-on-exercise-machine-T0XI8VthDiY) |
| Female maintenance / balance | Dane Wetton | [Woman practising yoga](https://unsplash.com/photos/woman-doing-fitness-I7FsT6N94io) |
| Male strength | Morrow Solutions | [Man lifting weights](https://unsplash.com/photos/a-man-lifting-weights-9W9BDUG7u9E) |
| Female strength | SUNDAY II SUNDAY | [Woman exercising in a gym](https://unsplash.com/photos/a-woman-is-doing-exercises-in-a-gym-fQNaadxn6i4) |
| Male fat-loss / activity imagery | Intenza Fitness | [Outdoor runner](https://unsplash.com/photos/a-man-in-a-black-vest-is-running-6elOj0O9f68) |
| Male maintenance | amol sonar | [Man exercising](https://unsplash.com/photos/man-in-black-shorts-doing-exercise-K3QQ6gHaeSQ) |

The selected source pages identify the standard [Unsplash License](https://unsplash.com/license). Review the current license and any applicable additional rights before changing context or promoting a public product. A photo does not imply that the depicted person endorses this website or has the health goal shown nearby.

`client/src/data.js` contains the source IDs and sizes. The ten photographs were downloaded once with `npm run photos:fetch` into `client/public/photos/` and are committed with the code, so every build serves them itself, the server removes `images.unsplash.com` from its content-security policy, and no visitor request reaches a third party. If the folder is ever missing, the original Unsplash URLs are used as a fallback; re-run `npm run photos:fetch` after changing the sources in `client/src/data.js`.

## Other visual resources

- Interface icons: Lucide, supplied through the installed package.
- Fonts: DM Sans and Manrope (variable versions) bundled from the `@fontsource-variable` packages and served by this app, with system fallbacks. No request goes to Google Fonts.
- Favicon: a simple original SVG letter mark in the website’s colours.
- Charts: SVG and CSS generated from actual user records; they are data visualizations, not stock images.

No sample body shape is presented as a guaranteed result. No before/after transformation image has been fabricated.
