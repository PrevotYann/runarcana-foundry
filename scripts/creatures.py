"""Convert explicit creature statistics without automating conditional prose."""
import re

ABILITIES={'strength':'str','dexterity':'dex','constitution':'con','intelligence':'int','wisdom':'wis','charisma':'cha'}
DAMAGE_TYPES={'acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder','shadow','antimonic','plasma','runic','glacial','incinerating','luminary','lunar','noctiferous','vibrational','intoxicating','lacerating','incisive','crushing','disruptive','gravitational','cronal'}

def number(value,default=0):
    match=re.search(r'[+-]?\d+(?:\.\d+)?(?:/\d+)?',str(value))
    if not match:return default
    parts=match[0].split('/')
    return float(parts[0])/float(parts[1]) if len(parts)==2 and float(parts[1]) else float(parts[0])

def modifier(abilities,key):return (abilities.get(key,10)-10)//2

def senses(text):
    ranges={}
    for amount,kind in re.findall(r'(\d+)\s*(?:feet|ft\.?)\s*(?:of\s+)?(darkvision|blindsight|tremorsense|truesight)',text,re.I):ranges[kind.lower()]=int(amount)
    for kind,amount in re.findall(r'(darkvision|blindsight|tremorsense|truesight)\s*(\d+)\s*(?:feet|ft\.?)',text,re.I):ranges[kind.lower()]=int(amount)
    return {'ranges':ranges,'units':'ft','special':text}

def saving_throws(creature,abilities):
    for feature in creature['features']:
        # Parse only explicitly labeled saving throw statistics, never a save DC in an attack.
        if feature['category'].casefold()!='defenses' or not re.fullmatch(r'saving throws?[:.]?',feature['name'].strip(),re.I):continue
        for name,bonus in re.findall(r'\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s*([+-]\d+)',feature['text'],re.I):
            key=ABILITIES[name.casefold()]
            abilities.setdefault(key,{'value':creature['abilities'].get(key,10)})
            abilities[key].update(proficient=0,save={'roll':{'bonus':str(int(bonus)-modifier(creature['abilities'],key))}})

def attack_fields(feature):
    if feature['category'].casefold() not in ['attacks','actions','reactions']:return None
    text=feature['text']
    text=re.sub(r'\b(?:Natural\s+)?Weapon\s+Attack,\s*(Melee|Ranged),',r'\1 Weapon Attack,',text,flags=re.I)
    text=re.sub(r'\b(Melee|Ranged)\s+Firearm\s+Attack',r'\1 Weapon Attack',text,flags=re.I)
    attack=re.search(r'\b(Melee|Ranged)\s+(?:Natural\s+)?(Weapon|Spell)\s+Attack\s*[,.:]\s*([+-]\d+)\s+to hit\b',text,re.I)
    if not attack:return None
    remainder=text[attack.end():]
    damage=re.search(r'\b(?:deals|takes)\s+(\d+)\s*\(([^)]+)\)\s*([A-Za-z]+)\s+damage',remainder,re.I)
    if not damage or damage[3].casefold() not in DAMAGE_TYPES:return None
    if re.search(r'\b(?:saving throw|DC\s*\d+|failure|failed|if)\b',remainder[:damage.start()],re.I):return None
    formula=re.sub(r'\s+','',damage[2])
    if not re.fullmatch(r'\d+d\d+(?:[+-]\d+)?|\d+',formula):return None
    reach=re.search(r'(\d+)\s*(?:ft\.?|feet)\s+reach',remainder[:damage.start()],re.I)
    ranged=re.search(r'(?:range\s*)?(\d+)(?:/(\d+))?\s*(?:ft\.?|feet)\s*(?:range)?',remainder[:damage.start()],re.I)
    distance=reach or ranged
    fields={'attack':{'ability':'none','bonus':attack[3],'flat':True,'type':{'value':attack[1].casefold(),'classification':attack[2].casefold()}},
            'damageFormula':formula,'damageType':damage[3].casefold(),
            'range':{'override':True,'value':distance[1] if distance else '', 'units':'ft' if distance else 'spec',
                     'special':remainder[:damage.start()].strip(' .,') if ranged and ranged[2] else ''},
            'activation':{'override':True,'type':'reaction' if feature['category'].casefold()=='reactions' else 'action','value':1}}
    fields['manualRange']=distance is None
    # Further damage, saving throws and conditions remain in the full description for adjudication.
    fields['manualRiders']=bool(remainder[damage.end():].strip(' .'))
    return fields
