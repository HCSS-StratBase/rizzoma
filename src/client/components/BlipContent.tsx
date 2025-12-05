import { BlipEditor } from './editor/BlipEditor';

export function BlipContent({ content, blipId }: { content: string; blipId?: string }): JSX.Element {
  return (
    <BlipEditor 
      content={content} 
      blipId={blipId ?? 'temp-blip'} 
      isReadOnly={true}
    />
  );
}

