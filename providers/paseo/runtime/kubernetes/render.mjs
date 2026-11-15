import {existsSync,lstatSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';

export function parseResources(text){
  const rows=[];let start=-1,depth=0,string=false,escaped=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(start<0){if(/\s/.test(c))continue;if(c!=='{')throw Error('Invalid kubectl JSON stream');start=i;depth=1;continue;}
    if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;continue;}
    if(c==='"')string=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){depth--;if(!depth){rows.push(JSON.parse(text.slice(start,i+1)));start=-1;}}
  }
  if(start>=0||!rows.length)throw Error('Incomplete kubectl JSON stream');
  return rows.flatMap(r=>r.kind==='List'?r.items:[r]);
}
export function insideCheckout(root,path){
  const target=realpathSync(resolve(root,path)),rel=relative(realpathSync(root),target);
  if(rel==='..'||rel.startsWith('..'+sep)||rel.includes('\0'))throw Error('Build/deployment path escapes the current checkout');
  return target;
}
// The privileged deployment helper reads an agent-owned checkout. Trust only
// that exact path for each read, without changing Git configuration or identity.
export function sourceGit(root,args,run){
  return run('git',['--no-optional-locks','-c','safe.directory='+realpathSync(root),'-C',root,...args],
    {env:{GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_SYSTEM:'/dev/null',GIT_TERMINAL_PROMPT:'0'}});
}
export async function sourceIdentity(root,run){
  const revision=(await sourceGit(root,['rev-parse','HEAD'],run)).trim();
  const diff=await sourceGit(root,['diff','--no-ext-diff','--no-textconv','--binary','HEAD','--','.'],run);
  const untracked=(await sourceGit(root,['ls-files','--others','--exclude-standard','-z'],run)).split('\0').filter(Boolean).sort();
  const hash=createHash('sha256').update(revision).update('\0').update(diff);
  for(const name of untracked){const path=insideCheckout(root,name);if(lstatSync(path).isSymbolicLink())throw Error('Source snapshot symlinks require explicit support');hash.update('\0'+name+'\0').update(readFileSync(path));}
  return {sourceRevision:revision,sourceContentSha256:hash.digest('hex')};
}
export async function currentWorktree(config,env,run){
  const workspaceId=env.PASEO_WORKSPACE_ID;
  if(typeof workspaceId!=='string'||!workspaceId.trim()||/[\0\r\n]/.test(workspaceId))throw Error('Run deployment from the current Paseo workspace');
  const expected=realpathSync(process.cwd());
  const root=realpathSync((await run('git',['--no-optional-locks','-c','safe.directory='+expected,'rev-parse','--show-toplevel'])).trim());
  const relativePath=relative(root,expected);
  if(relativePath==='..'||relativePath.startsWith('..'+sep))throw Error('Current checkout escapes the Paseo workspace');
  const common=realpathSync(resolve(root,(await sourceGit(root,['rev-parse','--git-common-dir'],run)).trim()));
  const primary=config.projectRoot??'/home/agent/project';
  if(!existsSync(primary)||common!==realpathSync(resolve(primary,(await sourceGit(primary,['rev-parse','--git-common-dir'],run)).trim())))throw Error('Worktree belongs to another project repository');
  return {projectId:config.projectId,worktreeId:workspaceId+'::'+root,root};
}
