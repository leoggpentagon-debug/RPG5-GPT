// RPG5 website -> ChatGPT. Visible game snapshot only; no Supabase reads or writes.
(() => {
  'use strict';
  const SCHEMA='rpg5-action-v1';
  const MAX_ACTION_LENGTH=4000;
  const MAX_MESSAGE_LENGTH=46000;
  const ORIGIN=location.origin;
  const pending=new Map();
  let lastAutoFilledPacket=null;
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const arr=v=>Array.isArray(v)?v:[];
  function take(source,keys){
    const result={};
    for(const key of keys)if(Object.hasOwn(obj(source),key))result[key]=source[key];
    return result;
  }
  function snapshot(packet,packetSha){
    const scene=obj(packet.scene),hero=obj(packet.hero),inventory=obj(hero.inventory);
    // Explicit allowlist: do NOT transmit NPC private state or the entire packet.
    return {
      schema:SCHEMA,storyline_id:packet.storyline_id,
      packet_sha256:packetSha||null,memory_revision:packet.memory_revision??null,
      canonical_status:'snapshot_of_last_rendered_player_visible_packet_not_a_database_save',
      scene:take(scene,['episode_number','scene_number','day','minute_of_day','time_label','location_id','location_detail','cast_ids']),
      hero:{
        hero_id:hero.hero_id||'oliver_hayes',
        stats:take(hero.stats,['health','stamina','stress','hunger','thirst']),
        skills:obj(hero.skills),physical:obj(hero.physical),
        inventory:{
          ...take(inventory,['complete']),
          items:arr(inventory.items).map(item=>take(item,[
            'item_id','name','quantity','unit','weight_kg','weight_unknown','physical_form',
            'location','location_scope','carried','is_container','container_id'
          ]))
        },
        carried_weight:take(hero.carried_weight,[
          'known_kg','unknown_carried_items','unknown_placement_items','inventory_complete',
          'exact','over_22kg_known','over_18kg_exact'
        ]),
        status_effects:arr(hero.status_effects).map(item=>take(item,[
          'id','name','polarity','certainty','effects','removal_condition','duration','remaining'
        ]))
      }
    };
  }
  function buildMessage(action,packet,packetSha){
    if(typeof action!=='string'||!action.trim()||action.length>MAX_ACTION_LENGTH)
      throw Error('Действие пустое или слишком длинное (максимум 4000 символов).');
    // Preserve exact literal saving trigger: RPG5 canon is never saved by this bridge.
    if(action.trim()==='сохранить')return 'сохранить';
    if(!packet||packet.schema!=='rpg5-gpt-packet-v1')
      throw Error('Нет подтверждённого JSON сцены. Сначала получи сцену в игре.');
    const context=snapshot(packet,packetSha);
    const message='Действие Оливера: '+action.trim()+'\n\n'+
      '[RPG5_SITE_SNAPSHOT_V1]\n'+JSON.stringify(context)+'\n[/RPG5_SITE_SNAPSHOT_V1]\n'+
      'Это снимок числовых и видимых данных сайта, не новое сохранение в Supabase. '+
      'Не считай его подтверждением новых действий или изменений. Сохраняй канон только по буквальной команде «сохранить».';
    if(message.length>MAX_MESSAGE_LENGTH)throw Error('Текущий снимок слишком большой для безопасной передачи.');
    return message;
  }
  function send(message,packetSha,onSuccess,onFailure){
    if(!message||pending.size){onFailure('Предыдущий запрос ещё обрабатывается.');return;}
    if(message!=='сохранить'&&packetSha&&lastAutoFilledPacket===packetSha){
      onFailure('Действие для этой сцены уже вставлено. Дождись ответа ChatGPT с новой сценой.');return;
    }
    const requestId=crypto.randomUUID();
    const timer=setTimeout(()=>settle(requestId,false,'Расширение не ответило. Обнови обе вкладки Ctrl+F5.'),6500);
    pending.set(requestId,{timer,message,packetSha,onSuccess,onFailure});
    window.postMessage({source:'RPG5_GAME',type:'ACTION_REQUEST',requestId,text:message},ORIGIN);
  }
  function settle(requestId,ok,error){
    const item=pending.get(requestId);if(!item)return;
    clearTimeout(item.timer);pending.delete(requestId);
    if(ok){
      if(item.message!=='сохранить')lastAutoFilledPacket=item.packetSha||null;
      item.onSuccess();
    }else item.onFailure(error||'ChatGPT не подтвердил вставку');
  }
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==ORIGIN)return;
    const msg=event.data;
    if(msg?.source==='RPG5_EXTENSION'&&msg.type==='RPG5_ACTION_RESULT')
      settle(msg.requestId,msg.ok===true,msg.error);
  });
  window.RPG5_ACTION_BRIDGE={buildMessage,send};
})();
