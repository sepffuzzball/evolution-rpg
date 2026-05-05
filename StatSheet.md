# Overview
The Stat Sheet is important as each character needs to have one. Ultimately, there are two types of stat sheets - Humanoid and Monster, the primary differences between the two being that Humanoids have a Class Level and Job Level which level up separately, whereas Monster races only have their Race Level.

# Stat Sheet Details
Name - The Character's name
Age - The Character's age. For character's that have been isekai'd, they may have 2 ages with a second age in parenthesis afterwards to denote mental age (for example, if someone was 20 years old and is then isekai'd into a rabbit's body, their age would be 0 (20)).
Race - The Character's current race. This can and will change whenever a character "Tier's up"
Tier - The Character's tier, 1-10
Level - The Character's level, with the current tier max in parenthesis (for example, if someone is tier 3 level 17, it should be 17 (20)). For Humanoids, they would have separate levels for their class and job
Exp - An abstract of how close a level (or for humanoids, class level and job level which means humanoids have 2 separate Exp bars) in a bar form from 0-100%

## Secondary Stats
HP - Health Points - [Calculation: (Fortitude * Tier) + Strength + Passive Bonuses + Equipment Bonuses]
MP - Mana Points - [Calculation: (Mana * Tier) + Intelligence + Passive Bonuses + Equipment Bonuses]

## Stats
On a stat sheet, the total stats should be shown but the bonus from the current race should be in parenthesis next to it - For example, Strength 40 (-10) for a race that is known to be physically weak.

### Stat Growth Formulas

Race, class, job, and item stat point pools are calculated first, then distributed across stats by the template's radar-chart ratio. For race, class, and job level-ups, `Tier` means the actual tier record the track is assigned to, not the template's minimum available tier and not always the character's latest tier. Tier definitions live in the Compendium and provide editable race/class/job/item multipliers.
Each level in a track contributes one full level-up point pool, including level 1. For example, a level 10 Tier 1 Common Humanoid race contributes 10 pools of `1 * 20 * 1 = 20`, for 200 total points before stat-ratio distribution.

- Race level-up points: `Character Type Multiplier * Tier Race Multiplier * Rarity Multiplier`.
- Class level-up points: `Tier Class Multiplier * Rarity Multiplier`.
- Job level-up points: `Tier Job Multiplier * Rarity Multiplier`.
- Item stat points: `Tier Item Multiplier * Rarity Multiplier`.
- Static tier bonus: each reached tier adds its tier bonus to every stat. Defaults use `Tier * 10`.

Character Type, Tier, and Rarity multipliers are managed from the app Compendium and stored with the shared ledger.

### Physical
Strength - A character's physical strength, the ability to push, pull, swing, etc.
Fortitude - A character's stamina, physical damage resistance, ability to resist being moved against their will

### Movement
Agility - Gross motor skills, focusing on speed, nibleness, balance, and the ability to rapidly change direction
Dexterity - Fine motor skills, focusing on refined, preceise tasks and tool or object manipulation

### Mental
Intelligence - A character's book smarts, ability to remember and recall things
Willpower - A character's mental fortitude and ability to stay sane during stressful situations

### Social
Wisdom - A measure of someone's ability to interact with others in the realm of knowledge
Charisma - A character's overall ability to get others to like them or do what they want

### Magical
Mana - A measure of someone's magical capability and reserves of magic
Mana Control - How adept someone is at controlling their magical abilities

### Sensory
Perception - A character's sensory detection and awareness
Stealth - A character's ability to minimize their impact on their surroundings

## Affinities
Elemental affinities listing, helps denote what types of elements someone is most adept at

## Active Skills
Skill - Each skill should have a level or level N/A, as well as a description of the skill. If the skill has the ability to level, it also needs it's own experience bar. The skill should also denote how it was awarded (typically through a race, job, or class level up)

## Passive Skills
Skill - Each skill should have a level or level N/A, as well as a description of the skill. If the skill has the ability to level, it also needs it's own experience bar. The skill should also denote how it was awarded (typically through a race, job, or class level up)
