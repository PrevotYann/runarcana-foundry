/** Fields required before Foundry constructs a compendium Folder during world startup. */
export function folderErrors(folder,documentType) {
  const errors=[];
  const key=folder._id??'unknown';
  if(typeof folder.name!=='string'||!folder.name.trim())errors.push(`Folder name is required: ${key}`);
  if(!/^[A-Za-z0-9]{16}$/.test(folder._id??''))errors.push(`Invalid folder ID: ${key}`);
  if(folder.type!==documentType)errors.push(`Folder type mismatch: ${key}`);
  return errors;
}
