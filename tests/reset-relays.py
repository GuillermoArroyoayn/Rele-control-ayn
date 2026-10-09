import json,re
from pathlib import Path
import fakeredis
r=fakeredis.FakeRedis(decode_responses=True)
script=re.search(r'const SCRIPT=`(.*?)`;',Path('api/reset-relays.js').read_text(),re.S)[1]
keys=['ayn:relay:devices','ayn:matrix:published','ayn:matrix:drafts','ayn:managed:actuators','ayn:managed:device-owners','ayn:managed:install-drafts','ayn:matrix:original:reservations','ayn:relay:timers','ayn:original:tuya:bindings']
accounts={n:dict(role=role,groupId=n,status='active',relays=[1,2,3],actuatorIds=['relay']) for n,role in [('master','super_master'),('Kata','admin'),('Osvi','admin'),('Karla','admin'),('resident','user')]}
r.set(keys[0],json.dumps(dict(masterId='master',devices=accounts)))
for k in keys[1:]:r.hset(k,'test',json.dumps({'actuators':[{'id':'relay'}],'branding':{'communityName':'Keep'},'modules':['access']}))
r.hset('ayn:temporary:grants:Karla','grant',json.dumps(dict(active=True,relays=[3],name='Guest')))
r.hset('ayn:actuator:profiles:Osvi','original-3','profile')
assert r.eval(script,len(keys),*keys)==1
reg=json.loads(r.get(keys[0]))
assert len(reg['devices'])==5
for account in reg['devices'].values():assert account['relays']==[] and account['actuatorIds']==[] and account['status']=='active'
for k in keys[1:3]:
 config=json.loads(r.hget(k,'test'));assert config['actuators']==[] and config['modules']==['access'] and config['branding']['communityName']=='Keep'
for k in keys[3:8]:assert not r.exists(k)
for n in [1,2,3]:assert json.loads(r.hget(keys[8],str(n)))['disabled']
assert not r.exists('ayn:actuator:profiles:Osvi')
grant=json.loads(r.hget('ayn:temporary:grants:Karla','grant'));assert not grant['active'] and grant['relays']==[]
assert r.eval(script,len(keys),*keys)==1
print('Reset transaction: all accounts cleared, original bindings disabled, temporary grants revoked, accounts/modules preserved; repeated reset succeeds.')
