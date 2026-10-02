// ============================================================
// Free-to-watch public domain films (Internet Archive)
// Playback + search happen CLIENT-SIDE in the user's browser
// (archive.org is CORS-enabled and keyless).
// ============================================================

import type { FreeMovie } from "./types";

/** Curated fallback catalog of classic public-domain films */
export const FREE_MOVIES: FreeMovie[] = [
  {
    identifier: "night_of_the_living_dead",
    title: "Night of the Living Dead",
    year: 1968,
    description:
      "George A. Romero's groundbreaking horror classic. Seven people trapped in a rural farmhouse fight off reanimated corpses. The film that defined the modern zombie genre.",
  },
  {
    identifier: "nosferatu",
    title: "Nosferatu",
    year: 1922,
    description:
      "F. W. Murnau's unauthorized silent adaptation of Dracula. Max Schreck's Count Orlok remains one of cinema's most terrifying images in this German expressionist masterpiece.",
  },
  {
    identifier: "his_girl_friday",
    title: "His Girl Friday",
    year: 1940,
    description:
      "Howard Hawks' rapid-fire screwball comedy with Cary Grant and Rosalind Russell. A newspaper editor schemes to keep his ex-wife and star reporter from remarrying.",
  },
  {
    identifier: "carnival_of_souls",
    title: "Carnival of Souls",
    year: 1962,
    description:
      "A cult horror landmark. After a car accident, a woman is drawn to an abandoned carnival pavilion and haunted by a pale phantom figure. David Lynch cited it as an influence.",
  },
  {
    identifier: "the_last_man_on_earth",
    title: "The Last Man on Earth",
    year: 1964,
    description:
      "Vincent Price stars as the sole survivor of a vampire plague in this first adaptation of Richard Matheson's 'I Am Legend'.",
  },
  {
    identifier: "house_on_haunted_hill",
    title: "House on Haunted Hill",
    year: 1959,
    description:
      "Vincent Price offers five guests $10,000 to survive a night in a haunted mansion. William Castle's beloved B-movie classic.",
  },
  {
    identifier: "plan_9_from_outer_space",
    title: "Plan 9 from Outer Space",
    year: 1959,
    description:
      "Ed Wood's legendary 'so bad it's good' sci-fi opus. Aliens resurrect the dead to stop humanity from destroying the universe.",
  },
  {
    identifier: "the_stranger",
    title: "The Stranger",
    year: 1946,
    description:
      "Orson Welles directs and stars as a hidden Nazi war criminal hunted in a sleepy Connecticut town. Also featuring Edward G. Robinson.",
  },
  {
    identifier: "the_phantom_of_the_opera",
    title: "The Phantom of the Opera",
    year: 1925,
    description:
      "Lon Chaney's iconic 'Man of a Thousand Faces' haunts the Paris Opera House in the definitive silent version of Gaston Leroux's novel.",
  },
  {
    identifier: "metropolis",
    title: "Metropolis",
    year: 1927,
    description:
      "Fritz Lang's towering sci-fi epic of a divided future city, featuring the legendary robot Maria. One of the most influential films ever made.",
  },
  {
    identifier: "the_general",
    title: "The General",
    year: 1926,
    description:
      "Buster Keaton's silent masterpiece. A Confederate railroad engineer chases his stolen locomotive — widely considered one of the greatest comedies of all time.",
  },
  {
    identifier: "sherlock_jr",
    title: "Sherlock Jr.",
    year: 1924,
    description:
      "Buster Keaton plays a film projectionist who dreams himself into a movie. Filled with jaw-dropping stunts decades ahead of their time.",
  },
];
