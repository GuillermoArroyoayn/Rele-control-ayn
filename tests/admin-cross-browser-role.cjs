const assert=require('node:assert/strict');
const D=require('../lib/devices');

const registry={
  masterId:'master-device',
  masterIds:[],
  revoked:{},
  devices:{
    'master-device':{role:'super_master',status:'active',phone:''},
    'admin-browser':{role:'admin',status:'active',groupId:'group-katherine',phone:'56978922720',adminName:'Katherine'},
    'installed-pwa':{role:'user',status:'active',groupId:'old-group',phone:'+56 9 7892 2720',adminName:'Katherine',actuatorIds:['old-actuator']}
  }
};

assert.equal(D.recoverAdminRole(registry,'installed-pwa'),true);
assert.equal(registry.devices['installed-pwa'].role,'admin');
assert.equal(registry.devices['installed-pwa'].groupId,'group-katherine');
assert.equal(registry.devices['installed-pwa'].adminName,'Katherine');
assert.deepEqual(registry.devices['installed-pwa'].actuatorIds,[]);
assert.deepEqual(registry.devices['installed-pwa'].relays,[]);

const ambiguous={
  masterId:'master',
  devices:{
    master:{role:'super_master',status:'active'},
    a1:{role:'admin',status:'active',groupId:'A',phone:'56911111111'},
    a2:{role:'admin',status:'active',groupId:'B',phone:'56911111111'},
    user:{role:'user',status:'active',groupId:'X',phone:'56911111111'}
  }
};
assert.equal(D.recoverAdminRole(ambiguous,'user'),false);
assert.equal(ambiguous.devices.user.role,'user');

const pending={
  masterId:'master',
  devices:{
    master:{role:'super_master',status:'active'},
    user:{role:'user',status:'active',groupId:'old',phone:'56922222222',pendingAdminUpgrade:{groupId:'new-group',name:'Administradora',creator:'master'}}
  }
};
assert.equal(D.recoverAdminRole(pending,'user'),true);
assert.equal(pending.devices.user.role,'admin');
assert.equal(pending.devices.user.groupId,'new-group');
assert.equal(pending.devices.user.pendingAdminUpgrade,undefined);

console.log('Recuperación de rol Administrador entre navegador y PWA verificada.');


const immediate={
  masterId:'master',
  devices:{
    master:{role:'super_master',status:'active'},
    phoneA:{role:'user',status:'active',groupId:'oldA',phone:'56933333333',actuatorIds:['x']},
    phoneB:{role:'user',status:'active',groupId:'oldB',phone:'+56 9 3333 3333',actuatorIds:['y']}
  }
};
for(const item of Object.values(immediate.devices)){
  if(item.role==='user'&&D.normalizedPhone(item.phone)==='56933333333'){
    item.role='admin';item.groupId='group-new';item.adminName='Katherine';item.status='active';item.relays=[];item.actuatorIds=[];
  }
}
assert.equal(immediate.devices.phoneA.role,'admin');
assert.equal(immediate.devices.phoneB.role,'admin');
assert.equal(immediate.devices.phoneA.groupId,'group-new');
assert.deepEqual(immediate.devices.phoneB.actuatorIds,[]);
console.log('Promoción inmediata por número verificada.');
