// Frozen v2 contract fixtures. Real backend responses from the 10Z-F 156-clip Cloud Run replay (rawEvidence, timing and model hashes removed);
// insufficient_signal/unavailable are contract-shaped variants (both states are in the frozen OpenAPI enum but rarely occur in the replay set).
export const backendFixtures = {
  "species_candidate__lead": {
    "apiVersion": 2,
    "requestId": "rc-64",
    "interpretedResult": {
      "state": "species_candidate",
      "speciesDisposition": "lead",
      "speciesPolicy": "lead",
      "speciesCandidates": [
        {
          "rank": 1,
          "label": "Erithacus rubecula",
          "ebirdCode": "eurrob1"
        },
        {
          "rank": 2,
          "label": "Cyanistes caeruleus",
          "ebirdCode": "blutit"
        },
        {
          "rank": 3,
          "label": "Phylloscopus collybita",
          "ebirdCode": "comchi1"
        },
        {
          "rank": 4,
          "label": "Sylvia atricapilla",
          "ebirdCode": "blackc1"
        },
        {
          "rank": 5,
          "label": "Turdus philomelos",
          "ebirdCode": "sonthr1"
        }
      ],
      "mixedChannels": [],
      "contexts": {
        "channels": [
          {
            "channelId": "speech",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "music",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "human_whistle",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "dog",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "vehicle",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "electronic_tone",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          }
        ],
        "topClasses": [
          {
            "classIndex": 106,
            "mid": "/m/015p6",
            "displayName": "Bird"
          },
          {
            "classIndex": 67,
            "mid": "/m/0jbk",
            "displayName": "Animal"
          },
          {
            "classIndex": 103,
            "mid": "/m/01280g",
            "displayName": "Wild animals"
          },
          {
            "classIndex": 107,
            "mid": "/m/020bb7",
            "displayName": "Bird vocalization, bird call, bird song"
          },
          {
            "classIndex": 108,
            "mid": "/m/07pggtn",
            "displayName": "Chirp, tweet"
          }
        ]
      },
      "conflicts": [],
      "reasonCodes": [
        "SPECIES_EVIDENCE_LEADING"
      ]
    },
    "userFacing": {
      "locale": "sv-SE",
      "copyKey": "species_lead",
      "headline": "Det låter mest som rödhake (Erithacus rubecula).",
      "body": null,
      "speciesLines": [
        "rödhake (Erithacus rubecula)",
        "blåmes (Cyanistes caeruleus)",
        "Phylloscopus collybita",
        "Sylvia atricapilla",
        "Turdus philomelos"
      ],
      "contextLines": []
    },
    "signalMetadata": {
      "durationSec": 5.014,
      "nearSilence": false,
      "tooShort": false,
      "truncated": true,
      "sampleRate": 48000
    },
    "flags": {
      "partialModels": false,
      "caveat": false,
      "provisionalP1Applied": false
    },
    "errors": [],
    "modelMetadata": {
      "router": {
        "version": "10v.0"
      }
    }
  },
  "species_candidate__caveat": {
    "apiVersion": 2,
    "requestId": "rc-72",
    "interpretedResult": {
      "state": "species_candidate",
      "speciesDisposition": "caveat",
      "speciesPolicy": "mention_with_caveat",
      "speciesCandidates": [
        {
          "rank": 1,
          "label": "Garrulus glandarius",
          "ebirdCode": "eurjay1"
        },
        {
          "rank": 2,
          "label": "Fringilla coelebs",
          "ebirdCode": "comcha"
        },
        {
          "rank": 3,
          "label": "Ardea cinerea",
          "ebirdCode": "graher1"
        },
        {
          "rank": 4,
          "label": "Fringilla montifringilla",
          "ebirdCode": "brambl"
        },
        {
          "rank": 5,
          "label": "Upupa epops",
          "ebirdCode": "hoopoe"
        }
      ],
      "mixedChannels": [],
      "contexts": {
        "channels": [
          {
            "channelId": "speech",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "music",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "human_whistle",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "dog",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "vehicle",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "electronic_tone",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          }
        ],
        "topClasses": [
          {
            "classIndex": 494,
            "mid": "/m/028v0c",
            "displayName": "Silence"
          },
          {
            "classIndex": 67,
            "mid": "/m/0jbk",
            "displayName": "Animal"
          },
          {
            "classIndex": 425,
            "mid": "/m/073cg4",
            "displayName": "Cap gun"
          },
          {
            "classIndex": 103,
            "mid": "/m/01280g",
            "displayName": "Wild animals"
          },
          {
            "classIndex": 106,
            "mid": "/m/015p6",
            "displayName": "Bird"
          }
        ]
      },
      "conflicts": [],
      "reasonCodes": [
        "HARD_CALL_POSITIVE_SPECIES_EVIDENCE",
        "SPECIES_EVIDENCE_CAVEATED",
        "SAFETY_INVARIANT_NO_DEFAULT_LEAD"
      ]
    },
    "userFacing": {
      "locale": "sv-SE",
      "copyKey": "uncertain_species",
      "headline": "Jag hör något fågelliknande, men arten är osäker.",
      "body": null,
      "speciesLines": [
        "Möjlig kandidat, osäker: nötskrika (Garrulus glandarius)"
      ],
      "contextLines": []
    },
    "signalMetadata": {
      "durationSec": 12.0,
      "nearSilence": false,
      "tooShort": false,
      "truncated": true,
      "sampleRate": 96000
    },
    "flags": {
      "partialModels": false,
      "caveat": true,
      "provisionalP1Applied": false
    },
    "errors": [],
    "modelMetadata": {
      "router": {
        "version": "10v.0"
      }
    }
  },
  "speech__withhold": {
    "apiVersion": 2,
    "requestId": "rc-11",
    "interpretedResult": {
      "state": "speech",
      "speciesDisposition": "withhold",
      "speciesPolicy": "withhold",
      "speciesCandidates": [],
      "mixedChannels": [
        "speech"
      ],
      "contexts": {
        "channels": [
          {
            "channelId": "speech",
            "role": "primary",
            "pooledTop1IsChannel": true,
            "presentInPooledTop5": true
          },
          {
            "channelId": "music",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "human_whistle",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "dog",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "vehicle",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "electronic_tone",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          }
        ],
        "topClasses": [
          {
            "classIndex": 0,
            "mid": "/m/09x0r",
            "displayName": "Speech"
          },
          {
            "classIndex": 494,
            "mid": "/m/028v0c",
            "displayName": "Silence"
          },
          {
            "classIndex": 488,
            "mid": "/m/07qyrcz",
            "displayName": "Plop"
          },
          {
            "classIndex": 5,
            "mid": "/m/0brhx",
            "displayName": "Speech synthesizer"
          },
          {
            "classIndex": 3,
            "mid": "/m/02qldy",
            "displayName": "Narration, monologue"
          }
        ]
      },
      "conflicts": [
        {
          "type": "species_vs_primary_human_context"
        }
      ],
      "reasonCodes": [
        "PRIMARY_SPEECH_CONTEXT",
        "SPECIES_EVIDENCE_WITHHELD"
      ]
    },
    "userFacing": {
      "locale": "sv-SE",
      "copyKey": "speech_dominant",
      "headline": "Jag hör främst tal i inspelningen.",
      "body": null,
      "speciesLines": [],
      "contextLines": [
        "Tal"
      ]
    },
    "signalMetadata": {
      "durationSec": 12.0,
      "nearSilence": false,
      "tooShort": false,
      "truncated": true,
      "sampleRate": 44100
    },
    "flags": {
      "partialModels": false,
      "caveat": false,
      "provisionalP1Applied": false
    },
    "errors": [],
    "modelMetadata": {
      "router": {
        "version": "10v.0"
      }
    }
  },
  "music__withhold": {
    "apiVersion": 2,
    "requestId": "rc-23",
    "interpretedResult": {
      "state": "music",
      "speciesDisposition": "withhold",
      "speciesPolicy": "withhold",
      "speciesCandidates": [],
      "mixedChannels": [
        "music"
      ],
      "contexts": {
        "channels": [
          {
            "channelId": "speech",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "music",
            "role": "primary",
            "pooledTop1IsChannel": true,
            "presentInPooledTop5": true
          },
          {
            "channelId": "human_whistle",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "dog",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "vehicle",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "electronic_tone",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          }
        ],
        "topClasses": [
          {
            "classIndex": 132,
            "mid": "/m/04rlf",
            "displayName": "Music"
          },
          {
            "classIndex": 148,
            "mid": "/m/05r5c",
            "displayName": "Piano"
          },
          {
            "classIndex": 149,
            "mid": "/m/01s0ps",
            "displayName": "Electric piano"
          },
          {
            "classIndex": 147,
            "mid": "/m/05148p4",
            "displayName": "Keyboard (musical)"
          },
          {
            "classIndex": 133,
            "mid": "/m/04szw",
            "displayName": "Musical instrument"
          }
        ]
      },
      "conflicts": [
        {
          "type": "species_vs_primary_human_context"
        }
      ],
      "reasonCodes": [
        "PRIMARY_MUSIC_CONTEXT",
        "SPECIES_EVIDENCE_WITHHELD"
      ]
    },
    "userFacing": {
      "locale": "sv-SE",
      "copyKey": "music_dominant",
      "headline": "Jag hör främst musik.",
      "body": null,
      "speciesLines": [],
      "contextLines": [
        "Musik"
      ]
    },
    "signalMetadata": {
      "durationSec": 9.453,
      "nearSilence": false,
      "tooShort": false,
      "truncated": true,
      "sampleRate": 44100
    },
    "flags": {
      "partialModels": false,
      "caveat": false,
      "provisionalP1Applied": false
    },
    "errors": [],
    "modelMetadata": {
      "router": {
        "version": "10v.0"
      }
    }
  },
  "human_whistle__withhold": {
    "apiVersion": 2,
    "requestId": "rc-0",
    "interpretedResult": {
      "state": "human_whistle",
      "speciesDisposition": "withhold",
      "speciesPolicy": "withhold",
      "speciesCandidates": [],
      "mixedChannels": [
        "human_whistle"
      ],
      "contexts": {
        "channels": [
          {
            "channelId": "speech",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "music",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "human_whistle",
            "role": "primary",
            "pooledTop1IsChannel": true,
            "presentInPooledTop5": true
          },
          {
            "channelId": "dog",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "vehicle",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "electronic_tone",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          }
        ],
        "topClasses": [
          {
            "classIndex": 35,
            "mid": "/m/01w250",
            "displayName": "Whistling"
          },
          {
            "classIndex": 396,
            "mid": "/m/0l156k",
            "displayName": "Whistle"
          },
          {
            "classIndex": 382,
            "mid": "/m/07pp_mv",
            "displayName": "Alarm"
          },
          {
            "classIndex": 67,
            "mid": "/m/0jbk",
            "displayName": "Animal"
          },
          {
            "classIndex": 103,
            "mid": "/m/01280g",
            "displayName": "Wild animals"
          }
        ]
      },
      "conflicts": [
        {
          "type": "species_vs_primary_human_context"
        }
      ],
      "reasonCodes": [
        "PRIMARY_HUMAN_WHISTLE",
        "SPECIES_EVIDENCE_WITHHELD"
      ]
    },
    "userFacing": {
      "locale": "sv-SE",
      "copyKey": "whistle_dominant",
      "headline": "Det här låter mer som mänsklig vissling än ett tydligt fågelläte.",
      "body": null,
      "speciesLines": [],
      "contextLines": [
        "Mänsklig vissling"
      ]
    },
    "signalMetadata": {
      "durationSec": 1.474,
      "nearSilence": false,
      "tooShort": false,
      "truncated": false,
      "sampleRate": 44100
    },
    "flags": {
      "partialModels": false,
      "caveat": false,
      "provisionalP1Applied": false
    },
    "errors": [],
    "modelMetadata": {
      "router": {
        "version": "10v.0"
      }
    }
  },
  "mixed_scene__withhold": {
    "apiVersion": 2,
    "requestId": "rc-19",
    "interpretedResult": {
      "state": "mixed_scene",
      "speciesDisposition": "withhold",
      "speciesPolicy": "withhold",
      "speciesCandidates": [],
      "mixedChannels": [
        "dog",
        "speech"
      ],
      "contexts": {
        "channels": [
          {
            "channelId": "speech",
            "role": "primary",
            "pooledTop1IsChannel": true,
            "presentInPooledTop5": true
          },
          {
            "channelId": "music",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "human_whistle",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "dog",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": true
          },
          {
            "channelId": "vehicle",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "electronic_tone",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          }
        ],
        "topClasses": [
          {
            "classIndex": 0,
            "mid": "/m/09x0r",
            "displayName": "Speech"
          },
          {
            "classIndex": 447,
            "mid": "/m/07qlf79",
            "displayName": "Spray"
          },
          {
            "classIndex": 69,
            "mid": "/m/0bt9lr",
            "displayName": "Dog"
          },
          {
            "classIndex": 73,
            "mid": "/m/07rc7d9",
            "displayName": "Bow-wow"
          },
          {
            "classIndex": 68,
            "mid": "/m/068hy",
            "displayName": "Domestic animals, pets"
          }
        ]
      },
      "conflicts": [
        {
          "type": "species_vs_primary_human_context"
        },
        {
          "type": "multi_source_field"
        }
      ],
      "reasonCodes": [
        "PRIMARY_SPEECH_CONTEXT",
        "CONTEXT_CONFLICT",
        "MIXED_SPEECH_SPECIES_WITHHELD",
        "SPECIES_EVIDENCE_WITHHELD"
      ]
    },
    "userFacing": {
      "locale": "sv-SE",
      "copyKey": "mixed_scene",
      "headline": "Det finns flera ljud samtidigt; jag kan inte peka ut en enda källa.",
      "body": null,
      "speciesLines": [],
      "contextLines": [
        "Hund",
        "Tal"
      ]
    },
    "signalMetadata": {
      "durationSec": 12.0,
      "nearSilence": false,
      "tooShort": false,
      "truncated": true,
      "sampleRate": 44100
    },
    "flags": {
      "partialModels": false,
      "caveat": false,
      "provisionalP1Applied": false
    },
    "errors": [],
    "modelMetadata": {
      "router": {
        "version": "10v.0"
      }
    }
  },
  "mixed_scene__caveat": {
    "apiVersion": 2,
    "requestId": "rc-9",
    "interpretedResult": {
      "state": "mixed_scene",
      "speciesDisposition": "caveat",
      "speciesPolicy": "mention_with_caveat",
      "speciesCandidates": [
        {
          "rank": 1,
          "label": "Megascops asio",
          "ebirdCode": "easowl1"
        },
        {
          "rank": 2,
          "label": "Eudynamys scolopaceus",
          "ebirdCode": "asikoe2"
        },
        {
          "rank": 3,
          "label": "Apaloderma vittatum",
          "ebirdCode": "battro1"
        },
        {
          "rank": 4,
          "label": "Crypturellus cinnamomeus",
          "ebirdCode": "thitin1"
        },
        {
          "rank": 5,
          "label": "Sarothrura elegans",
          "ebirdCode": "busflu1"
        }
      ],
      "mixedChannels": [
        "dog",
        "human_whistle"
      ],
      "contexts": {
        "channels": [
          {
            "channelId": "speech",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "music",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "human_whistle",
            "role": "primary",
            "pooledTop1IsChannel": true,
            "presentInPooledTop5": true
          },
          {
            "channelId": "dog",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": true
          },
          {
            "channelId": "vehicle",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "electronic_tone",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          }
        ],
        "topClasses": [
          {
            "classIndex": 35,
            "mid": "/m/01w250",
            "displayName": "Whistling"
          },
          {
            "classIndex": 68,
            "mid": "/m/068hy",
            "displayName": "Domestic animals, pets"
          },
          {
            "classIndex": 67,
            "mid": "/m/0jbk",
            "displayName": "Animal"
          },
          {
            "classIndex": 69,
            "mid": "/m/0bt9lr",
            "displayName": "Dog"
          },
          {
            "classIndex": 72,
            "mid": "/m/07qf0zm",
            "displayName": "Howl"
          }
        ]
      },
      "conflicts": [
        {
          "type": "species_vs_primary_human_context"
        },
        {
          "type": "multi_source_field"
        }
      ],
      "reasonCodes": [
        "PRIMARY_HUMAN_WHISTLE",
        "CONTEXT_CONFLICT",
        "SPECIES_EVIDENCE_CAVEATED"
      ]
    },
    "userFacing": {
      "locale": "sv-SE",
      "copyKey": "mixed_scene",
      "headline": "Det finns flera ljud samtidigt; jag kan inte peka ut en enda källa.",
      "body": null,
      "speciesLines": [
        "Möjlig kandidat, osäker: Megascops asio"
      ],
      "contextLines": [
        "Hund",
        "Mänsklig vissling"
      ]
    },
    "signalMetadata": {
      "durationSec": 12.0,
      "nearSilence": false,
      "tooShort": false,
      "truncated": true,
      "sampleRate": 44100
    },
    "flags": {
      "partialModels": false,
      "caveat": true,
      "provisionalP1Applied": false
    },
    "errors": [],
    "modelMetadata": {
      "router": {
        "version": "10v.0"
      }
    }
  },
  "unresolved__withhold": {
    "apiVersion": 2,
    "requestId": "rc-33",
    "interpretedResult": {
      "state": "unresolved",
      "speciesDisposition": "withhold",
      "speciesPolicy": "withhold",
      "speciesCandidates": [],
      "mixedChannels": [],
      "contexts": {
        "channels": [
          {
            "channelId": "speech",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "music",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "human_whistle",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "dog",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "vehicle",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "electronic_tone",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          }
        ],
        "topClasses": [
          {
            "classIndex": 127,
            "mid": "/m/09ld4",
            "displayName": "Frog"
          },
          {
            "classIndex": 286,
            "mid": "/m/0j6m2",
            "displayName": "Stream"
          },
          {
            "classIndex": 282,
            "mid": "/m/0838f",
            "displayName": "Water"
          },
          {
            "classIndex": 438,
            "mid": "/m/04k94",
            "displayName": "Liquid"
          },
          {
            "classIndex": 447,
            "mid": "/m/07qlf79",
            "displayName": "Spray"
          }
        ]
      },
      "conflicts": [
        {
          "type": "known_non_bird_context"
        }
      ],
      "reasonCodes": [
        "SECONDARY_NON_BIRD_CONTEXT",
        "UNRESOLVED_CONTEXT",
        "SPECIES_EVIDENCE_WITHHELD",
        "SAFETY_INVARIANT_NO_DEFAULT_CAVEAT"
      ]
    },
    "userFacing": {
      "locale": "sv-SE",
      "copyKey": "unresolved",
      "headline": "Jag kan inte avgöra ljudet tillräckligt säkert.",
      "body": null,
      "speciesLines": [],
      "contextLines": []
    },
    "signalMetadata": {
      "durationSec": 8.438,
      "nearSilence": false,
      "tooShort": false,
      "truncated": true,
      "sampleRate": 22050
    },
    "flags": {
      "partialModels": false,
      "caveat": false,
      "provisionalP1Applied": false
    },
    "errors": [],
    "modelMetadata": {
      "router": {
        "version": "10v.0"
      }
    }
  },
  "unresolved__caveat": {
    "apiVersion": 2,
    "requestId": "rc-10",
    "interpretedResult": {
      "state": "unresolved",
      "speciesDisposition": "caveat",
      "speciesPolicy": "mention_with_caveat",
      "speciesCandidates": [
        {
          "rank": 1,
          "label": "Dryocopus martius",
          "ebirdCode": "blawoo1"
        },
        {
          "rank": 2,
          "label": "Bubo virginianus",
          "ebirdCode": "grhowl"
        },
        {
          "rank": 3,
          "label": "Bubo bubo",
          "ebirdCode": "eueowl1"
        },
        {
          "rank": 4,
          "label": "Asio otus",
          "ebirdCode": "loeowl"
        },
        {
          "rank": 5,
          "label": "Strix aluco",
          "ebirdCode": "tawowl1"
        }
      ],
      "mixedChannels": [],
      "contexts": {
        "channels": [
          {
            "channelId": "speech",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "music",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "human_whistle",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "dog",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "vehicle",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "electronic_tone",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          }
        ],
        "topClasses": [
          {
            "classIndex": 67,
            "mid": "/m/0jbk",
            "displayName": "Animal"
          },
          {
            "classIndex": 106,
            "mid": "/m/015p6",
            "displayName": "Bird"
          },
          {
            "classIndex": 103,
            "mid": "/m/01280g",
            "displayName": "Wild animals"
          },
          {
            "classIndex": 110,
            "mid": "/m/0h0rv",
            "displayName": "Pigeon, dove"
          },
          {
            "classIndex": 494,
            "mid": "/m/028v0c",
            "displayName": "Silence"
          }
        ]
      },
      "conflicts": [],
      "reasonCodes": [
        "BIRD_EVIDENCE_GENERIC_ONLY",
        "SPECIES_EVIDENCE_CAVEATED",
        "SAFETY_INVARIANT_NO_DEFAULT_LEAD",
        "UNRESOLVED_CONTEXT"
      ]
    },
    "userFacing": {
      "locale": "sv-SE",
      "copyKey": "unresolved",
      "headline": "Jag kan inte avgöra ljudet tillräckligt säkert.",
      "body": null,
      "speciesLines": [
        "Möjlig kandidat, osäker: Dryocopus martius"
      ],
      "contextLines": []
    },
    "signalMetadata": {
      "durationSec": 12.0,
      "nearSilence": false,
      "tooShort": false,
      "truncated": true,
      "sampleRate": 48000
    },
    "flags": {
      "partialModels": false,
      "caveat": true,
      "provisionalP1Applied": false
    },
    "errors": [],
    "modelMetadata": {
      "router": {
        "version": "10v.0"
      }
    }
  },
  "insufficient_signal__withhold": {
    "apiVersion": 2,
    "requestId": "rc-11",
    "interpretedResult": {
      "state": "insufficient_signal",
      "speciesDisposition": "withhold",
      "speciesPolicy": "withhold",
      "speciesCandidates": [],
      "mixedChannels": [
        "speech"
      ],
      "contexts": {
        "channels": [
          {
            "channelId": "speech",
            "role": "primary",
            "pooledTop1IsChannel": true,
            "presentInPooledTop5": true
          },
          {
            "channelId": "music",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "human_whistle",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "dog",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "vehicle",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "electronic_tone",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          }
        ],
        "topClasses": [
          {
            "classIndex": 0,
            "mid": "/m/09x0r",
            "displayName": "Speech"
          },
          {
            "classIndex": 494,
            "mid": "/m/028v0c",
            "displayName": "Silence"
          },
          {
            "classIndex": 488,
            "mid": "/m/07qyrcz",
            "displayName": "Plop"
          },
          {
            "classIndex": 5,
            "mid": "/m/0brhx",
            "displayName": "Speech synthesizer"
          },
          {
            "classIndex": 3,
            "mid": "/m/02qldy",
            "displayName": "Narration, monologue"
          }
        ]
      },
      "conflicts": [
        {
          "type": "species_vs_primary_human_context"
        }
      ],
      "reasonCodes": [
        "INSUFFICIENT_SIGNAL"
      ]
    },
    "userFacing": {
      "locale": "sv-SE",
      "copyKey": "insufficient_signal",
      "headline": "Ljudet är för kort eller för svagt.",
      "body": null,
      "speciesLines": [],
      "contextLines": []
    },
    "signalMetadata": {
      "durationSec": 12.0,
      "nearSilence": true,
      "tooShort": false,
      "truncated": true,
      "sampleRate": 44100
    },
    "flags": {
      "partialModels": false,
      "caveat": false,
      "provisionalP1Applied": false
    },
    "errors": [],
    "modelMetadata": {
      "router": {
        "version": "10v.0"
      }
    }
  },
  "unavailable__unavailable": {
    "apiVersion": 2,
    "requestId": "rc-11",
    "interpretedResult": {
      "state": "unavailable",
      "speciesDisposition": "unavailable",
      "speciesPolicy": "withhold",
      "speciesCandidates": [],
      "mixedChannels": [
        "speech"
      ],
      "contexts": {
        "channels": [
          {
            "channelId": "speech",
            "role": "primary",
            "pooledTop1IsChannel": true,
            "presentInPooledTop5": true
          },
          {
            "channelId": "music",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "human_whistle",
            "role": "primary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "dog",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "vehicle",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          },
          {
            "channelId": "electronic_tone",
            "role": "legacy_secondary",
            "pooledTop1IsChannel": false,
            "presentInPooledTop5": false
          }
        ],
        "topClasses": [
          {
            "classIndex": 0,
            "mid": "/m/09x0r",
            "displayName": "Speech"
          },
          {
            "classIndex": 494,
            "mid": "/m/028v0c",
            "displayName": "Silence"
          },
          {
            "classIndex": 488,
            "mid": "/m/07qyrcz",
            "displayName": "Plop"
          },
          {
            "classIndex": 5,
            "mid": "/m/0brhx",
            "displayName": "Speech synthesizer"
          },
          {
            "classIndex": 3,
            "mid": "/m/02qldy",
            "displayName": "Narration, monologue"
          }
        ]
      },
      "conflicts": [
        {
          "type": "species_vs_primary_human_context"
        }
      ],
      "reasonCodes": [
        "PARTIAL_MODELS"
      ]
    },
    "userFacing": {
      "locale": "sv-SE",
      "copyKey": "unavailable",
      "headline": "",
      "body": null,
      "speciesLines": [],
      "contextLines": []
    },
    "signalMetadata": {
      "durationSec": 12.0,
      "nearSilence": false,
      "tooShort": false,
      "truncated": true,
      "sampleRate": 44100
    },
    "flags": {
      "partialModels": true,
      "caveat": false,
      "provisionalP1Applied": false
    },
    "errors": [],
    "modelMetadata": {
      "router": {
        "version": "10v.0"
      }
    }
  }
}
