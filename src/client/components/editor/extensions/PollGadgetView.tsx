import { NodeViewWrapper } from '@tiptap/react';
import { Box, Text, Progress, Button, Group, Stack, ActionIcon, Title, Badge } from '@mantine/core';
import { Vote, Trash2, Plus } from 'lucide-react';
import { useState } from 'react';

type PollOption = { id: string; label: string; votes: number };
const DEFAULT_POLL_LABELS = ['Yes', 'No', 'Maybe'];
const fallbackPollLabel = (idx: number) => DEFAULT_POLL_LABELS[idx] || `Option ${idx + 1}`;

export function PollGadgetView(props: any) {
  const { node, updateAttributes, selected, editor } = props;
  const { question, options } = node.attrs;
  const isEditable = editor.isEditable;

  const parsedOptions: PollOption[] = Array.isArray(options) 
    ? options.map((option: any, idx: number) => {
        if (typeof option === 'string') {
          return { id: `opt-${idx + 1}`, label: option || fallbackPollLabel(idx), votes: 0 };
        }
        return {
          id: option?.id ?? `opt-${idx + 1}`,
          label: option?.label || fallbackPollLabel(idx),
          votes: Number(option?.votes ?? 0),
        };
      }).filter((option: PollOption) => option.label)
    : typeof options === 'string' 
      ? JSON.parse(options) 
      : [];

  const [hoveredOption, setHoveredOption] = useState<string | null>(null);

  const totalVotes = parsedOptions.reduce((acc, opt) => acc + (opt.votes || 0), 0);

  const handleVote = (optionId: string) => {
    if (!isEditable) return;
    const newOptions = parsedOptions.map(opt => {
      if (opt.id === optionId) {
        return { ...opt, votes: (opt.votes || 0) + 1 };
      }
      return opt;
    });
    updateAttributes({ options: newOptions });
  };

  const handleAddOption = () => {
    const newOptions = [
      ...parsedOptions,
      { id: `opt-${Date.now()}`, label: 'New option', votes: 0 }
    ];
    updateAttributes({ options: newOptions });
  };

  const handleRemoveOption = (optionId: string) => {
    const newOptions = parsedOptions.filter(opt => opt.id !== optionId);
    updateAttributes({ options: newOptions });
  };

  const handleLabelChange = (optionId: string, newLabel: string) => {
    const newOptions = parsedOptions.map(opt => {
      if (opt.id === optionId) {
        return { ...opt, label: newLabel };
      }
      return opt;
    });
    updateAttributes({ options: newOptions });
  };

  return (
    <NodeViewWrapper
      className={`gadget-node-view ${selected ? 'selected' : ''}`}
      style={{ display: 'block', width: '100%' }}
    >
      <Box 
        p={12}
        my={8}
        style={(theme) => ({
          border: `1px solid ${selected ? theme.colors.teal[5] : '#d7dfeb'}`,
          borderRadius: '14px',
          background: selected
            ? 'linear-gradient(180deg, rgba(244,255,252,0.98) 0%, rgba(255,255,255,0.98) 72%)'
            : 'linear-gradient(180deg, rgba(248,251,255,0.98) 0%, rgba(255,255,255,0.98) 70%)',
          boxShadow: selected
            ? '0 12px 28px rgba(7, 38, 46, 0.11)'
            : '0 8px 18px rgba(15, 23, 42, 0.06)',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
          width: '100%',
          maxWidth: '100%',
          position: 'relative',
          overflow: 'hidden',
          marginInline: 0,
        })}
      >
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'radial-gradient(circle at top right, rgba(32, 201, 151, 0.14), transparent 32%)',
          }}
        />

        <Group justify="space-between" mb={10} style={{ position: 'relative' }}>
          <Group gap={10}>
            <Box
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(18, 184, 134, 0.14)',
                color: 'var(--mantine-color-teal-7)',
              }}
            >
              <Vote size={15} />
            </Box>
            <div>
              <Badge
                variant="light"
                color="teal"
                radius="sm"
                styles={{
                  root: {
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  },
                }}
              >
                Poll
              </Badge>
              <Text size="10px" c="dimmed" mt={2}>
                Collaborative decision point
              </Text>
            </div>
          </Group>
          <Box
            px={10}
            py={4}
            style={{
              borderRadius: 999,
              background: 'rgba(15, 23, 42, 0.05)',
            }}
          >
            <Text size="xs" fw={700} c="dimmed">
              {totalVotes} total votes
            </Text>
          </Box>
        </Group>

        <Title
          order={4}
          mb={10}
          style={{
            position: 'relative',
            color: '#10233a',
            lineHeight: 1.2,
          }}
        >
          {isEditable ? (
            <input 
              value={question} 
              onChange={(e) => updateAttributes({ question: e.target.value })}
              style={{ 
                border: 'none', 
                outline: 'none', 
                width: '100%', 
                background: 'transparent',
                fontSize: 'inherit',
                fontWeight: 'inherit',
                color: 'inherit',
                padding: 0,
              }}
            />
          ) : question}
        </Title>

        <Stack gap={6}>
          {parsedOptions.map((option) => {
            const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
            return (
              <Box 
                key={option.id}
                onMouseEnter={() => setHoveredOption(option.id)}
                onMouseLeave={() => setHoveredOption(null)}
                style={{
                  position: 'relative',
                  cursor: isEditable ? 'pointer' : 'default',
                  borderRadius: 10,
                  padding: '8px 10px',
                  background: hoveredOption === option.id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)',
                  border: hoveredOption === option.id ? '1px solid rgba(18,184,134,0.25)' : '1px solid transparent',
                }}
                onClick={() => handleVote(option.id)}
              >
                <Group justify="space-between" mb={6}>
                  <Group gap="xs" style={{ flex: 1 }}>
                    {isEditable && hoveredOption === option.id ? (
                       <input 
                        value={option.label}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleLabelChange(option.id, e.target.value)}
                        style={{
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          width: '100%',
                          fontSize: '0.95rem',
                          fontWeight: 600,
                          color: '#132238',
                        }}
                       />
                    ) : (
                      <Text size="sm" fw={600} c="#132238">{option.label}</Text>
                    )}
                  </Group>
                  <Group gap="xs">
                  <Text size="10px" fw={700} c="#0f766e">{Math.round(percentage)}%</Text>
                    {isEditable && hoveredOption === option.id && (
                      <ActionIcon 
                        variant="subtle" 
                        color="red" 
                        size="xs" 
                        onClick={(e) => { e.stopPropagation(); handleRemoveOption(option.id); }}
                      >
                        <Trash2 size={12} />
                      </ActionIcon>
                    )}
                  </Group>
                </Group>
                <Progress 
                  value={percentage} 
                  size="md" 
                  radius="xl" 
                  color="teal.5"
                  animated={hoveredOption === option.id}
                  style={{ backgroundColor: 'rgba(148, 163, 184, 0.18)' }}
                />
              </Box>
            );
          })}
        </Stack>

        {isEditable && (
          <Button 
            variant="light"
            color="teal" 
            fullWidth 
            mt={10} 
            size="sm"
            leftSection={<Plus size={14} />}
            onClick={handleAddOption}
            styles={{
              root: {
                borderRadius: 10,
                fontWeight: 700,
                minHeight: 34,
              },
            }}
          >
            Add Option
          </Button>
        )}
      </Box>
    </NodeViewWrapper>
  );
}
