import { render } from '@testing-library/react';
import { setup, renderWithRedux } from './test-utils';
import { Button, Input, Select } from './components';

describe('Component Tests', () => {
  it('should handle click events', async () => {
    const { getByText, user } = setup(<Button>Click me</Button>);
    await user.click(getByText('Click me'));
  });

  it('should handle hover events', async () => {
    const { getByText, user } = setup(<Button>Hover me</Button>);
    await user.hover(getByText('Hover me'));
  });

  it('should handle blur events', async () => {
    const { getByRole, user } = setup(<Input />);
    await user.blur(getByRole('textbox'));
  });

  it('should handle change events', async () => {
    const { getByRole, user } = setup(<Input />);
    await user.type(getByRole('textbox'), 'new value');
  });

  it('should handle input events', async () => {
    const { getByRole, user } = setup(<Input />);
    await user.type(getByRole('textbox'), 'typed value');
  });

  it('should handle focus events', async () => {
    const { getByRole, user } = setup(<Input />);
    await user.click(getByRole('textbox'));
  });

  it('should handle multiple events in sequence', async () => {
    const { getByRole, user } = setup(<Input />);
    const input = getByRole('textbox');
    
    await user.click(input);
    await user.type(input, 'new value');
    await user.blur(input);
  });

  it('should work with Redux setup', async () => {
    const { getByText, user } = renderWithRedux(<Button>Redux Button</Button>);
    await user.click(getByText('Redux Button'));
  });

  it('should handle select change events', async () => {
    const { getByRole, user } = setup(
      <Select>
        <option value="1">Option 1</option>
        <option value="2">Option 2</option>
      </Select>
    );
    
    await user.type(getByRole('combobox'), '2');
  });

  it('should handle mouse out events', async () => {
    const { getByText, user } = setup(<Button>Hover me</Button>);
    await user.unhover(getByText('Hover me'));
  });
}); 