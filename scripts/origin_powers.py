"""Reviewed activities, counters and innate grants from complete origin source snapshots."""
import re
HASHES={'Antroplantae':'08bba36cbc92bed2c4cb3278f7e606109a04461ef470af8f6bd5d8d9818cb0dd','Chireans':'ea25b1ff4591ceda2b8998197abf18aa3e663dc39662fd34144901af8bab4643','Construct':'5df86610a7dd2bb97239d849919849133325d80321ad84a7a67b3d6cff08951f','Minotaur':'90fd5a7b52121365d0d2049874c0a18d519270ec7484c4d4b394a37db394fe01','Troll':'23953e1f3863a6fe8ae126728fbfe8f0b2c46576be0143ceac6a216fb36ca8c7','Vastaya':'ba0f213b54803c361e6d92c65eef2af3ee0bc141f48e649dd9e9623eaea4efa5','Yordle':'c86602d3f6248cc6ba2c34912e9b50a4f791f5a078406c5b3fc3a31c0140d9fe'}

def powers(page,profile,variant=None):
    origin=page['title'];name=variant or ''
    if origin not in HASHES:return
    if page['sha256']!=HASHES[origin]:profile['powersReviewRequired']=True;return
    result=[]
    def power(label,activity='utility',max=None,recovery='long',activation='action',**fields):
        definition={'id':re.sub(r'[^a-z0-9]+','-',(name+'-'+label).lower()).strip('-'),'name':label,'kind':'activity','level':1,'activityType':activity,'activation':activation,'description':profile['notes'],'sourceHash':page['sha256'],**fields}
        if max is not None:definition.update(max=max,recovery=recovery)
        result.append(definition)
    if origin=='Chireans' and name=='Fulgor':power('Geolocation',max='@prof',seconds=60,managed='selfEffect',changes=[['system.attributes.senses.ranges.blindsight',60,'upgrade']])
    if origin=='Construct':
        if name=='Brutal':power('Surpass the Limits',max='floor(@prof / 2)',rounds=3,managed='selfEffect',changes=[['system.attributes.movement.speeds.walk',40,'override']],followup={'rounds':2,'changes':[['system.attributes.movement.speeds.walk',15,'override']]})
        if name=='Envoy':power('Geolocation',max='@prof',turns=1,managed='selfEffect',changes=[['system.attributes.senses.ranges.blindsight',60,'upgrade']])
        if name=='Nimble':
            power('Kinetic Energy',max='floor(@prof / 2)',activation='bonus',resolution='Choose the metal melee weapon or unarmed attack; additional damage is Dash distance in feet divided by 5.')
            power('Duelist',activation='reaction',resolution='Requires a proficient finesse weapon and a melee hit; make a native weapon attack with advantage against the attacker.')
    if origin=='Minotaur':
        if name=='Aelus':power('Reactive',max='floor(@prof / 2)',recovery='full',activation='reaction',resolution='Grants one additional reaction this round; the reaction action itself uses its native workflow.')
        if name=='Alnuk':power('Words of Comfort',max='@prof',range=30,managed='comfort',resolution='Target must hear you; select and remove Frightened or Charmed.')
        if name=='Aurochs':
            power('Triumphant Roar',activity='save',max='max(1, @abilities.con.mod)',activation='bonus',save='wis',dc='10 + @prof + @abilities.con.mod',shape='sphere',size=10,condition='frightened',seconds=60,resolution='Enemies repeat the save at each turn end; successful saves grant 24-hour immunity. Allies within 15 feet receive proficiency plus Constitution modifier temporary HP.')
            power('Triumphant Roar - Allies',activity='heal',activation='bonus',healing='max(0, @prof + @abilities.con.mod)',healingType='temphp',shape='sphere',size=15,freeRider='Triumphant Roar')
    if origin=='Vastaya':
        if name=='Oovi-Kat':
            power('Scrutiny',activity='check',ability='cha',bonus='@prof',activation='minute',activationValue=5,dc='',resolution='Requires five minutes observation; the GM sets the DC. Memories cover the previous two hours; no statistics are copied.')
            power("Clone of Sho'ma",max='@prof',recovery='full',activation='bonus',turns=1,resolution='Clone moves in a chosen direction, disappears if attacked, and lasts until next turn end. Perception/Arcana DC is 8 + proficiency + Charisma modifier.')
        if name=='Marai':power('Sonar',activity='save',max='@prof',recovery='full',save='con',dc='8 + @prof + @abilities.con.mod',damage='1d4 + @prof + @abilities.con.mod',damageType='thunder',shape='cone',size=15,resolution='Deaf targets have advantage on the save; success causes no damage.')
        if name=='Shimon':
            power('Unbounded',max='@prof',recovery='full',resolution='Reroll one failed Strength, Dexterity or Constitution check.')
            power('Simian Fury',max='2 * @prof',recovery='full',resolution='Double the damage modifier of the chosen melee attack; unarmed damage also increases one die category.')
        if name=='Fauhwoon':power('Natural Protectors',resolution='After an action/bonus action heals or protects an ally, increase the next attack damage die scale by one and add proficiency damage.')
        if name=='Ottrani':
            power('Selfsacrifice',max='floor(@details.level / 2)',recovery='full',range=30,managed='selfsacrifice')
            power('Rescue',activity='heal',max='max(0, floor(@abilities.wis.mod / 2))',recovery='full',range=5,healing='max(0, @prof + floor(@abilities.wis.mod / 2))')
        if name=='Lhotlan':power('Plumdaggers',max='3 + @prof',recovery='full',activation='bonus',managed='plumdaggers')
        if name=='Vesani':
            power('Fox Fire',max='@prof',activation='bonus',managed='foxFire')
            power('Devour Essence',max='floor(@prof / 2)',range=5,managed='devourEssence')
            profile.setdefault('spellGrants',[]).append({'spell':'arcane-shot','ability':'selected'})
    if origin=='Yordle' and name=='Faeric':power('Fey Essence',activity='save',save='cha',dc='8 + @prof + @abilities.cha.mod',range=5,resolution='Touch reveals current emotions; a failed save additionally reveals intentions.')
    if origin=='Antroplantae' and name=='Floral':power('Branch',max='10 * @prof',activation='bonus',managed='floralBranch')
    profile.setdefault('actions',[]).extend(result)

def botany_powers(page,option):
    if page['sha256']!=HASHES['Antroplantae']:option['powersReviewRequired']=True;return
    name=option['name']
    grants={'Elm':[('druidcraft',''),('guidance','')],'Luminescence':[('light',''),('dancing-lights','')],'Willow':[('animal-friendship','')],'Yew tree':[('see-invisibility','')],'Cedar':[('create-sapling','')],'Supernatural Charm':[('charm-person','cha')]}
    option['spellGrants']=[{'spell':spell,'ability':ability} for spell,ability in grants.get(name,[])]
    for grant in option['spellGrants']:
        if name=='Cedar':grant.update(max='1',recovery='long',castLevels=[[1,1],[5,3],[7,4]],cedar=True)
        if name=='Willow':grant.update(castLevels=[[1,1],[3,2],[5,3],[7,4]])
        if name=='Yew tree':grant.update(max='floor(@prof / 2)',recovery='long')
        if name=='Supernatural Charm':grant.update(max='max(1, floor(@abilities.cha.mod / 2))',recovery='long')
    if name in ['Oak','Sequoia']:option['carryLarger']=True
    if name=='Sequoia':option['naturalDamageBonus']='floor(@prof / 2)'
    if name=='Brambleback':option['unarmedFireBonus']='@abilities.con.mod'
    if name in ['Ebony',"Emperor's Flower"]:option['weaknessProficiency']=2
