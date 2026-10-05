import { getEditorCore } from '../editor/pm';
export function installNoteMenu(win: Window) {
 const doc=win.document, tab=doc.createElement('button');
 tab.type='button'; tab.className='option'; tab.tabIndex=-1;
 tab.id='latex-suite-open-note-tab'; tab.setAttribute('role','menuitem');
 tab.textContent='Edit in New Tab';
 let stopped=false;
 tab.addEventListener('click',async()=>{
  if(stopped||tab.disabled)return;
  tab.disabled=true;
  try {
   getEditorCore(win)?.view?.domObserver?.forceFlush?.();
   const open=(win as any).__latexSuiteOpenNoteTab;
   if(!open)throw new Error('Restart Zotero to enable opening note tabs.');
   await open();
  } catch(error){if(!stopped)win.alert(String(error));}
  finally{tab.disabled=false;}
 });
 const attach=()=>{const menu=doc.querySelector('.more-dropdown .popup');if(menu&&tab.parentNode!==menu)menu.append(tab);};
 const observer=new (win as any).MutationObserver(attach);
 observer.observe(doc.body,{childList:true,subtree:true});attach();
 return ()=>{stopped=true;observer.disconnect();tab.remove();};
}
