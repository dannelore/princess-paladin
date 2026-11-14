/* ==========================================================================
   The Dark Urge Run — the route
   /side-quests/game-quest/bg3/bg3-data.js

   Everything index.html draws. Facts checked against bg3.wiki on
   13 November 2026.

   The shape of the run, decided with Danni: give in to the Urge far more
   than fight it, under 60 hours, with the Urge-only scenes, one romance
   (Astarion) and the darkly funny options. The one place it holds back is
   Act 2, because sparing Isobel is what unlocks the best romance scene.

   RUN is a list of acts. Each act has steps, in the order to do them:
     { id, type, where, title, text, more?, moreLabel? }
       type   main | urge | romance | chaos   (colour and filter)
       more   tucked behind "What happens" — put spoilers here, not in text
     { id, where, title, text, options:[{ key, label, text, mine? }], more? }
       a choice; `mine` marks the option the plan assumes

   Step ids are what Firestore remembers, so never reuse or rename one.
   ========================================================================== */

const GLANCE = [
  { label:"You",     value:"Oathbreaker Paladin", note:"The Dark Urge origin. Any race; the white dragonborn is the canon look." },
  { label:"Party",   value:"Astarion, Shadowheart, Lae'zel", note:"Minthara takes a seat in Act 2." },
  { label:"Romance", value:"Astarion", note:"He is there from hour one and enjoys every bad idea." },
  { label:"Time",    value:"About 45 hours", note:"13 for Act 1, 12 for Act 2, 20 for Act 3. That leaves 15 spare." }
];

const RULES = [
  "<b>Sleep often.</b> The Urge only speaks at night. Long rest whenever a step says to, and at least every couple of hours otherwise.",
  "<b>If it isn't on this list, walk past it.</b> The journal will fill with unfinished quests. Let it.",
  "<b>Take the Dark Urge lines.</b> They are tagged in the dialogue list and they are the reason for this run.",
  "<b>Quicksave before every choice</b> (F5), so you can peek at the other branch and reload.",
  "<b>Balanced difficulty.</b> Drop to Explorer the moment a fight needs a third try. Nobody is keeping score.",
  "<b>Eat every tadpole.</b> It suits the run and opens stronger options in conversations.",
  "<b>Astarion never leaves the party.</b> Approval and romance scenes only build while he is with you.",
  "<b>Levels to aim for:</b> 5 before the mountain pass, 9 before the city, 12 before the end."
];

const RUN = [

  /* ------------------------------------------------------------------ */
  { id:"setup", kicker:"Before you start", title:"Make your monster",
    blurb:"Ten minutes in the character creator. The only thing that must be right is the origin.",
    hours:"10 minutes",
    steps:[
      { id:"s-origin", type:"main", where:"Character creation", title:"Choose The Dark Urge",
        text:"It is on the Origin row, last in the list. Race and looks are yours to change. Your background is fixed to Haunted One." },
      { id:"s-class", type:"main", where:"Character creation", title:"Make them a Paladin",
        text:"Tough, simple, and Charisma is your main talking stat, which matters because this run talks its way past a lot. Strength 16, Charisma 16, Constitution 14. Take any oath; it will not last the first hour.",
        moreLabel:"Levelling, kept simple",
        more:"Stay Paladin all the way to 12. Great Weapon Fighting style, a two-handed sword, heavy armour. Feats: Great Weapon Master at 4, Strength +2 at 8, Savage Attacker at 12. In fights, hit things and spend spell slots on Divine Smite. If you would rather play the canon version, the default Dark Urge is a Sorcerer and that works just as well for conversations." },
      { id:"s-diff", type:"main", where:"New game", title:"Start on Balanced",
        text:"You can change difficulty at any time from the menu, so there is no wrong pick here." }
    ]
  },

  /* ------------------------------------------------------------------ */
  { id:"act1", kicker:"Act One", title:"The wilderness",
    blurb:"Meet the crew, find out what sleeps inside you, and hand a grove full of refugees to the goblins. Siding with the goblins is also the short way through this act: one battle instead of three boss hunts.",
    hours:"About 13 hours", level:"Leave at level 5",
    steps:[
      { id:"a1-us", type:"urge", where:"The crashed ship, second room", title:"Meet the brain",
        text:"A talking brain asks to be freed from a skull. Free it, then take the Dark Urge line about a brain full of holes. It follows you through the ship either way." },
      { id:"a1-shadowheart", type:"main", where:"The ship, room with the pods", title:"Let Shadowheart out",
        text:"She is banging on a pod. Take the rune from the dead body in the side room, slot it into the console by her pod and will it open. She joins on the spot." },
      { id:"a1-helm", type:"main", where:"The ship's helm", title:"Run for the controls",
        text:"Ignore the big fight between the mind flayer and the devil. Walk your party to the tentacles at the far end and use them. That is the whole objective." },
      { id:"a1-crew", type:"main", where:"The beach and the road north", title:"Collect Astarion and Lae'zel",
        text:"Astarion is just up the path west of the wreck, shouting about a boar. Lae'zel is in a hanging cage a little north; tell the two tieflings to leave and cut her down." },
      { id:"a1-gale", where:"Roadside Cliffs waypoint", title:"A hand comes out of a portal",
        text:"The purple rune stone on the cliff starts sparking. A hand reaches through and asks for help.",
        options:[
          { key:"chop", mine:true, label:"Cut it off", text:"The Urge's first proper joke. Gale is gone for good, your oath breaks, and you keep the hand in your bag. Do not sell it. It comes back in Act 3." },
          { key:"pull", label:"Pull him out", text:"You gain Gale the wizard as a companion. He leaves after the grove unless you talk him round." }
        ] },
      { id:"a1-oath", type:"main", where:"Camp, next long rest", title:"Meet the Oathbreaker Knight",
        text:"Once your oath is broken a knight appears in camp. Talk to him and take the Oathbreaker powers. Do not pay to restore the oath; it would only break again." },
      { id:"a1-grove", type:"main", where:"Emerald Grove", title:"Tour the place you are going to burn",
        text:"Follow the road west to the gate and help with the fight. Inside, buy anything you want from Dammon the smith and Arron the trader now, because neither will be here later. You do not need to pick up Wyll; he leaves when the grove falls." },
      { id:"a1-alfira", type:"chaos", where:"Emerald Grove, the cliff east of the tiefling camp", title:"Help Alfira finish her song",
        text:"A bard is stuck on a song for her dead teacher. Encourage her and play along. It takes five minutes, it is lovely, and it makes a later night much worse." },
      { id:"a1-grove-urge", type:"urge", where:"Emerald Grove", title:"Let the Urge off the lead",
        text:"Three small ones, all optional: a squirrel near the druids' stone circle runs at you, Nettie the healer has a wounded bird on her table in the inner sanctum, and a paralysed tiefling called Pandirna guards the storeroom by the beach. The Urge has ideas about each." },
      { id:"a1-bite", type:"romance", where:"Camp, second or third long rest", title:"Wake up to Astarion",
        text:"You catch him leaning over you in the night. Let him feed. It is the first step of the romance and he fights better for it." },
      { id:"a1-bard", type:"urge", where:"Camp, first long rest after crossing the bridge west of the grove", title:"A visitor in the night",
        text:"Cross the stone bridge toward the Blighted Village, then long rest. Someone arrives at camp asking to stay. It does not matter what you answer.",
        more:"You wake up covered in blood with Alfira dead beside you. There is no way to prevent it. If Alfira is already dead a different bard comes instead. Choose how you explain it to the others; nobody leaves over it." },
      { id:"a1-fel", type:"urge", where:"Camp, a later long rest", title:"Meet your butler",
        text:"A small, delighted creature introduces himself and hands you a reward. Equip it straight away.",
        more:"Sceleritas Fel gives you the Deathstalker Mantle: once a turn, killing an enemy turns you invisible for two turns. It is one of the best cloaks in the game and only the Urge can get it." },
      { id:"a1-scratch", type:"chaos", where:"The woods just north of the road between the grove and the Blighted Village", title:"A dog for the murder camp",
        text:"A white dog is guarding a dead courier. Let him sniff your hand and he turns up at camp later. Pet him every night. He does not judge." },
      { id:"a1-camp-in", type:"main", where:"Goblin Camp, west of the Blighted Village", title:"Walk in the front door",
        text:"Tell the guards you are a True Soul and use your tadpole when it is offered. The whole camp stays friendly. Head inside the ruined temple, the Shattered Sanctum." },
      { id:"a1-camp-urge", type:"urge", where:"Goblin Camp", title:"Sample the local cuisine",
        text:"Outside, a goblin called Crusher wants his foot kissed, and there is roast dwarf on the spit. Both have a Dark Urge answer." },
      { id:"a1-abdirak", type:"chaos", where:"Shattered Sanctum, the shrine beside the torture room", title:"Ask a priest to hit you",
        text:"Abdirak serves the goddess of pain and offers a blessing. Take off your chest armour first, then take all three blows and play along. You get a permanent bonus when badly hurt, and Astarion enjoys it far too much." },
      { id:"a1-volo", type:"chaos", where:"Shattered Sanctum, the cage in the side room", title:"Rescue the worst writer in Faerûn",
        text:"Volo is being kept as a pet poet. Get him out before you speak to Minthara: tell his keeper Gribbo you want him, or lift her key. He moves into your camp.",
        more:"On the long rest after he arrives he offers to remove your tadpole with a needle. Say yes and keep saying yes. You lose an eye and gain a magic one that sees invisible things for the rest of the game." },
      { id:"a1-minthara", type:"main", where:"Shattered Sanctum, the war room at the back", title:"Tell Minthara where the grove is",
        text:"She is the drow at the map table. Give her the location. Then leave and long rest, which sets the raid up. Do not go near the mountain pass before the raid or the game cancels it." },
      { id:"a1-raid", type:"urge", where:"Emerald Grove gate", title:"Raid the grove",
        text:"Speak to Zevlor on the ramparts above the gate, sound the war horn, and open the gate when Minthara tells you to. Then clear the grove with the goblins, one section at a time. This is the longest fight of the act.",
        more:"Everyone in the grove dies, including the druids. Wyll and Karlach will never join you now, and Halsin is gone. Minthara gives you a lyre and a tadpole and tells you to meet her at Moonrise Towers." },
      { id:"a1-party", type:"romance", where:"Camp, the long rest after the raid", title:"The goblin party",
        text:"Walk around and talk to everyone before bed. When Astarion suggests spending the night together, say yes, then pick him when you go to sleep. Shadowheart drinks herself unconscious, which is its own small joy." },
      { id:"a1-level", type:"main", where:"The Risen Road, north of the Blighted Village", title:"Check you are level 5",
        text:"If you are short, the gnoll pack on the Risen Road is on your way and their leader can be turned on her own pack with your tadpole. The Urge has a line when you find them." },
      { id:"a1-creche", type:"main", where:"Mountain Pass, the monastery at the top", title:"Visit Lae'zel's people",
        text:"Take the road north-west past the goblin camp into the Mountain Pass and bring Lae'zel. Under the monastery is a githyanki base that promises to cure you. It takes about two hours and explains what the strange artefact in your bag really is." },
      { id:"a1-leave", type:"main", where:"Mountain Pass, the road down past the monastery", title:"Take the road into the dark",
        text:"The game warns you to tie up loose ends. You have none. Go." }
    ],
    skip:[
      "The Underdark and Grymforge. The mountain pass is the shorter road.",
      "Auntie Ethel and the swamp.",
      "Karlach and Wyll. They both leave after the grove, so do not spend time on them.",
      "Killing the three goblin leaders and rescuing the druid Halsin. That is the other side's plot.",
      "The cellars and wells of the Blighted Village, the burning inn, the Zhentarim hideout."
    ]
  },

  /* ------------------------------------------------------------------ */
  { id:"act2", kicker:"Act Two", title:"The Shadow-Cursed Lands",
    blurb:"A cursed valley, a tower full of people who think you are on their side, and the one night this run fights the Urge instead of feeding it. This act holds the biggest choice of the run, so read Isobel's step before you get there.",
    hours:"About 12 hours", level:"Leave at level 9",
    steps:[
      { id:"a2-convoy", type:"main", where:"The road in, just past the first fight", title:"Call the escort",
        text:"You arrive in pitch dark, so keep a torch lit. An orc named Kansif is waiting by the road. Play the lyre Minthara gave you and a drider with a magic lantern comes to walk you through." },
      { id:"a2-pixie", type:"chaos", where:"On the road with the drider", title:"Steal the lantern",
        text:"Partway along, Harpers ambush the convoy. Turn on the drider and take his Moonlantern. Open it and there is a furious pixie inside. Let her out and she blesses the party so the curse cannot touch you, while insulting you the whole time.",
        more:"The Urge can crush her in its fist instead. It is funny for one second and then you have no protection from the curse, so reload afterwards if you try it." },
      { id:"a2-inn", type:"main", where:"Last Light Inn, north-west over the small bridge", title:"Check in at the last safe place",
        text:"Talk your way past Jaheira at the gate. It has traders and a waypoint. Do not go upstairs yet. Long rest first." },
      { id:"a2-order", type:"urge", where:"Camp, your first long rest in Act 2", title:"Your butler has a request",
        text:"He names someone at the inn and tells you what to do about her." },
      { id:"a2-isobel", where:"Last Light Inn, upstairs", title:"Isobel",
        text:"Isobel is the cleric whose spell keeps the inn alive. When you talk to her a fight breaks out. This is the fork of the whole run, and the two rewards cannot both be had.",
        options:[
          { key:"spare", mine:true, label:"Defend her", text:"The one time this run says no. It keeps the inn and its traders, and it sets up the best scene your romance gets. You must then also keep the Nightsong alive later on." },
          { key:"kill", label:"Do as you were told", text:"Everyone in the inn dies and you fight what is left of them. Your butler rewards you with a monstrous new form a rest or two later. You lose the romance scene." }
        ],
        more:"If you defend her, win the fight quickly: if her attacker carries her off, the inn still falls. The reward for killing her is Slayer form, a huge clawed shape you can turn into once per rest. If you spare her you can still earn it in Act 3." },
      { id:"a2-moonrise", type:"urge", where:"Moonrise Towers, at the west end of the valley", title:"Walk into the enemy's house",
        text:"The guards wave you through. Go to the throne room and watch the general pass sentence on Minthara. Several people here seem to know you. Afterwards, the Urge may help with the goblins being punished." },
      { id:"a2-araj", type:"romance", where:"Moonrise Towers, ground floor, the room right of the entrance", title:"Back Astarion up",
        text:"A drow trader called Araj wants Astarion to bite her and he does not want to. Take his side, however good her bribe sounds. On your next long rest he comes to talk, and that conversation is where the romance turns real." },
      { id:"a2-minthara", type:"main", where:"Moonrise Towers prison, downstairs", title:"Get Minthara out",
        text:"Do this on your first visit or she is lost. Two questioners are wiping her mind in a cell off the prison. Lie that you are taking over, or kill them, then walk her out on foot. She joins you at camp." },
      { id:"a2-thorms", type:"chaos", where:"Reithwin Town, the middle of the valley", title:"Talk a family to death",
        text:"The general's three relatives each run a ruined building, and each can be beaten with words alone. The brewer wants a drinking contest and stories, and the Urge has stories about the grove. The toll collector can be argued out of her job. The surgeon can be told to demonstrate on himself. Do as many as amuse you; all three if you are behind on levels." },
      { id:"a2-mausoleum", type:"main", where:"Grand Mausoleum, north of Reithwin Town", title:"Open the tomb",
        text:"Inside, press the buttons under the three paintings in this order: Moonrise Towers, Grief, the General. A devil in a nice coat stops by to ask a favour. Take the lift down to the Gauntlet of Shar." },
      { id:"a2-yurgir", type:"chaos", where:"Gauntlet of Shar, the east side", title:"Read a devil his own contract",
        text:"Yurgir is the creature the devil wants dead. Ask him to recite his contract, then point out the loophole. With three good persuasion rolls he kills his followers, his pet, and then himself. Save first, and do not touch his chests beforehand. Take the gem from his lair." },
      { id:"a2-scars", type:"romance", where:"Camp, the long rest after Yurgir", title:"Collect on the favour",
        text:"The devil keeps his word and tells Astarion what the scars on his back mean. Have Astarion with you when he does." },
      { id:"a2-trials", type:"main", where:"Gauntlet of Shar", title:"Three trials in the dark",
        text:"Bring Shadowheart. Finish the three trials for their gems: sneak through one, fight your own copies in one, walk an invisible path in the last. With Yurgir's gem you have four, which opens the way down. This is the point of no return for the valley." },
      { id:"a2-nightsong", where:"The Shadowfell, below the Gauntlet", title:"The Nightsong",
        text:"After a fight with a necromancer, Shadowheart is handed a spear and a prisoner and looks at you.",
        options:[
          { key:"spare", mine:true, label:"Tell her to stop", text:"Goes with defending Isobel. The inn survives, you gain a powerful ally for the big fight, and Shadowheart's story turns away from her goddess." },
          { key:"kill", label:"Let her strike", text:"Goes with killing Isobel. Shadowheart gets what she always wanted and becomes something colder. The big fight is harder alone." }
        ],
        more:"If the Nightsong dies, Isobel dies with her, and the game counts that as your kill: you get Slayer form and lose the night scene. So if you defended Isobel for the romance, the Nightsong has to live." },
      { id:"a2-night", type:"urge", where:"Camp, a long rest after the Shadowfell", title:"The night the Urge comes for him",
        text:"Only if you defended Isobel. Rest before storming the tower. Your butler is displeased and names a new victim. Warn him, and ask to be tied up.",
        more:"The Urge tries to make you kill Astarion in his sleep. You need one Wisdom roll of 14 to wake him, then two of 18 while bound. Drink or cast anything that helps Wisdom rolls before bed, and save first. If you fail, he dies for good." },
      { id:"a2-assault", type:"main", where:"Moonrise Towers", title:"Storm the tower",
        text:"Everyone you have not killed turns up to help. Fight to the roof, then follow the general down through the hole in the floor." },
      { id:"a2-kressa", type:"urge", where:"Under Moonrise, the laboratory north of the barracks", title:"Find the woman who remembers you",
        text:"Before the last fight, look for a necromancer called Kressa in a side lab. Talk to her before anyone draws a weapon. She fills in a piece of what happened to you." },
      { id:"a2-ketheric", type:"main", where:"Under Moonrise, the pool at the bottom", title:"Finish the general",
        text:"Watch the scene first; two more people who know you are in it. Then a long two-part fight. Long rest afterwards and take the road to Baldur's Gate." }
    ],
    skip:[
      "Lifting the shadow curse. The druid who does it died in the grove.",
      "The Harpers' errands, the missing tiefling children and the strange ox.",
      "The House of Healing morgue, the masons' guild, and the frozen man by the lake.",
      "Selling anyone's soul to the devil for the hooded child. Not yet."
    ]
  },

  /* ------------------------------------------------------------------ */
  { id:"act3", kicker:"Act Three", title:"Baldur's Gate",
    blurb:"The city is where the game hides forty hours of side quests and where your own story finally gets told. Stick to the list. Details are tucked behind each step so you can read ahead safely.",
    hours:"About 20 hours", level:"Finish at level 12",
    steps:[
      { id:"a3-circus", type:"chaos", where:"Rivington, the circus by the first waypoint", title:"Try to get into the circus",
        text:"The doorman's pet can smell what you are. Talk your way in as a reformed killer. Volunteer when the clown asks for a helper, then spin the genie's wheel and accuse him of cheating.",
        more:"The clown show ends in an ambush. The genie turns you into a wheel of cheese for a few turns, or, if you actually win, drops you in a jungle with a legendary spear." },
      { id:"a3-vision", type:"urge", where:"Camp, your first long rest in Rivington", title:"Dream of home",
        text:"Rest as soon as you arrive. Your father would like a word." },
      { id:"a3-gortash", where:"Wyrm's Rock Fortress, the bridge into the city", title:"Attend a coronation",
        text:"Walk into the audience hall as yourself, no disguise. The man being crowned greets you like an old friend and offers a deal.",
        options:[
          { key:"ally", mine:true, label:"Shake on it", text:"The fast road. You leave his factory and his prison alone, which cuts two long dungeons, and deal with him last." },
          { key:"refuse", label:"Turn him down", text:"You fight him and his steel guards later, usually after breaking his factory first. Several hours longer." }
        ],
        more:"Gortash tells you that you were the original Chosen of Bhaal and that the whole plot was your idea and his. If you ally with him, stay out of the Steel Watch Foundry and the Iron Throne or the deal is off." },
      { id:"a3-deal", type:"chaos", where:"Sharess' Caress, upstairs, on the bridge before the city gate", title:"Hear the devil's offer",
        text:"The devil from the tomb has a room here and a contract ready. Listen to all of it. Signing is optional and only matters if you plan to free the prisoner at the very end." },
      { id:"a3-city", type:"main", where:"Lower City", title:"Enter the city, lose a friend",
        text:"Go through the gate to the Lower City and long rest once. Someone left at camp will be taken, and the kidnapper leaves an invitation. Keep Astarion in your party so it is not him." },
      { id:"a3-cazador", where:"Cazador's Palace, on the city wall north of the Lower City", title:"Astarion's old master",
        text:"Climb to the ramparts and enter by the tower, with Astarion. Fight down to the dungeon. At the end he can take everything his master was after.",
        options:[
          { key:"ascend", mine:true, label:"Help him take it", text:"The embrace ending for him: powerful, vain and delighted. He will ask something of you afterwards. Say yes if you want the romance to continue." },
          { key:"spawn", label:"Talk him out of it", text:"He stays who he is, and the romance becomes the gentler version." }
        ] },
      { id:"a3-grief", type:"main", where:"House of Grief, north-west corner of the Lower City", title:"Shadowheart goes home",
        text:"Optional, about an hour. Bring Shadowheart and ask for a private session. Skip it if the clock is tight." },
      { id:"a3-tribunal", type:"urge", where:"Candulhallow's Tombstones, north-east of the Elfsong Tavern", title:"Present a hand to the Murder Tribunal",
        text:"In the back office, press the button behind the skull painting and give the password Sicarius. Take the right-hand path. They ask for proof of a kill, and you have been carrying one since the first hour.",
        more:"Gale's hand counts as your token, and his ghost is called up to testify against you. The judge is family and calls you the true heir. To join, kill the prisoner they offer you; it opens a shop of excellent assassin's gear. If you pulled Gale out instead, you need a hand from one of the city's murder victims." },
      { id:"a3-orin", type:"urge", where:"Temple of Bhaal, under the city through the sewers", title:"Answer the invitation",
        text:"Follow the journal down through the sewers to the temple. Your butler is waiting at the door and lets you in. Be level 11 or 12. She offers a duel, one against one. Accept it.",
        more:"Orin is your sister, and she is the one who put you on that ship. The duel is you alone against her monstrous form. Refusing it kills the hostage. Use everything: potions, scrolls, smites." },
      { id:"a3-bhaal", where:"Temple of Bhaal, straight after the duel", title:"An offer from your father",
        text:"Quicksave here. What you answer decides which endings are open to you.",
        options:[
          { key:"accept", mine:true, label:"Take what is yours", text:"The embrace ending. Opens the ending only the Urge can get." },
          { key:"reject", label:"Refuse him", text:"The redemption ending. Costs you something, and then you are free." }
        ],
        more:"Accept and you become Bhaal's Chosen: Slayer form if you do not have it, and a spell that kills outright. Jaheira and her friends attack you on the way out. Refuse and Bhaal kills you on the spot; you are brought back without the Urge, for good." },
      { id:"a3-stones", type:"main", where:"Wyrm's Rock Fortress, then the sewers", title:"Collect the last stone",
        text:"If you allied with Gortash, go back to him. He asks for your stones. Say no, twice; it is a test. Then take the boat in the sewers to the Morphic Pool and he meets you there. You will not have to fight him." },
      { id:"a3-ready", type:"main", where:"Camp", title:"Last night in the city",
        text:"The boat ride is the point of no return. Before it: reach level 12, buy potions, long rest, and talk to everyone in camp one last time." },
      { id:"a3-prism", where:"The Astral Plane", title:"Who do you trust?",
        text:"Your guardian and the prisoner cannot both walk away.",
        options:[
          { key:"guardian", mine:true, label:"Stay with your guardian", text:"Simplest, and it keeps the party as it is. Lae'zel will have feelings." },
          { key:"prisoner", label:"Free the prisoner", text:"Needs the devil's hammer. Someone has to pay a heavy price for it." }
        ] },
      { id:"a3-brain", type:"main", where:"The High Hall and above", title:"Climb to the brain",
        text:"Two long fights back to back. Call in every ally the game offers. Spend everything you have left." },
      { id:"a3-end", where:"On top of the brain", title:"The last choice",
        text:"Save before the final blow. If you took your father's offer there is a line here nobody else ever sees.",
        options:[
          { key:"bhaal", mine:true, label:"In Bhaal's name", text:"The ending this whole run has been building to." },
          { key:"destroy", label:"Destroy it", text:"Save the world anyway. It will cost you." }
        ],
        more:"As Bhaal's Chosen you can seize the brain in his name and order the whole world to kill itself, starting with your companions if you like. If you accepted Bhaal and destroy the brain instead, he tears your mind apart as punishment. Watch one, reload, watch the other." }
    ],
    skip:[
      "The Steel Watch Foundry and the Iron Throne prison. Your deal with Gortash depends on leaving them alone.",
      "The House of Hope, the dragon under the fortress, the wizard's tower and the toy shop.",
      "The newspaper, the murders investigation, the missing letters and the haunted house.",
      "Jaheira's and Minsc's quests, and the Guild.",
      "Everything in Rivington except the circus."
    ]
  }
];
