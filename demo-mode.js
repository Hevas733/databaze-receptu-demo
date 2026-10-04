(()=>{
  if(['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname)||new URLSearchParams(location.search).has('embedded'))return;
  const note=document.createElement('div');
  note.textContent='Prezentační verze · Úpravy a importy se ukládají pouze v tomto prohlížeči.';
  note.style.cssText='padding:9px 16px;background:#fff3cd;color:#664d03;font:14px system-ui;text-align:center;position:relative;z-index:10';
  document.body.prepend(note);
})();
