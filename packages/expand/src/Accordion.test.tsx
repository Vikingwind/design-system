import React from 'react';
import { fireEvent, render, act } from '@testing-library/react';
import { Accordion, AccordionItem } from '.';

jest.useFakeTimers();

test('renders a single accordion item', () => {
  const { getByTestId, queryByText } = render(
    <Accordion>
      <AccordionItem title="Trains" data-testid="trains-button">
        Trains go choo choo
      </AccordionItem>
    </Accordion>,
  );

  // Default unmountOnClose=false: content in DOM but hidden
  const content = queryByText('Trains go choo choo');
  expect(content).toBeInTheDocument();
  expect(content!.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );

  fireEvent.click(getByTestId('trains-button'));
  act(() => {
    jest.runAllTimers();
  });

  expect(content!.closest('.eds-base-expand')).not.toHaveAttribute(
    'aria-hidden',
  );

  fireEvent.click(getByTestId('trains-button'));

  expect(content!.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
});

test('renders a group of accordion items that can be opened and closed', () => {
  const { getByTestId, queryByText } = render(
    <Accordion>
      <AccordionItem title="Trains" data-testid="trains-button">
        Trains go choo choo
      </AccordionItem>
      <AccordionItem title="Boats" data-testid="boats-button">
        Boats float
      </AccordionItem>
      <AccordionItem title="Buses" data-testid="buses-button">
        Buses go vroom vroom
      </AccordionItem>
    </Accordion>,
  );

  const trains = queryByText('Trains go choo choo')!;
  const boats = queryByText('Boats float')!;
  const buses = queryByText('Buses go vroom vroom')!;

  // All closed initially
  expect(trains.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(boats.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(buses.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );

  fireEvent.click(getByTestId('boats-button'));
  act(() => {
    jest.runAllTimers();
  });

  expect(trains.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(boats.closest('.eds-base-expand')).not.toHaveAttribute('aria-hidden');
  expect(buses.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );

  fireEvent.click(getByTestId('trains-button'));
  act(() => {
    jest.runAllTimers();
  });

  expect(trains.closest('.eds-base-expand')).not.toHaveAttribute('aria-hidden');
  expect(boats.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(buses.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );

  fireEvent.click(getByTestId('trains-button'));

  expect(trains.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(boats.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(buses.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
});

test('works with the defaultOpen option', () => {
  const { getByTestId, queryByText } = render(
    <Accordion>
      <AccordionItem title="Trains" defaultOpen data-testid="trains-button">
        Trains go choo choo
      </AccordionItem>
      <AccordionItem title="Boats" data-testid="boats-button">
        Boats float
      </AccordionItem>
      <AccordionItem title="Buses" data-testid="buses-button">
        Buses go vroom vroom
      </AccordionItem>
    </Accordion>,
  );

  act(() => {
    jest.runAllTimers();
  });

  const trains = queryByText('Trains go choo choo')!;
  const boats = queryByText('Boats float')!;
  const buses = queryByText('Buses go vroom vroom')!;

  expect(trains.closest('.eds-base-expand')).not.toHaveAttribute('aria-hidden');
  expect(boats.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(buses.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );

  fireEvent.click(getByTestId('boats-button'));
  act(() => {
    jest.runAllTimers();
  });

  expect(trains.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(boats.closest('.eds-base-expand')).not.toHaveAttribute('aria-hidden');
  expect(buses.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
});

test('controlled Accordion with openId and onToggle', () => {
  const spy = jest.fn();
  const { getByTestId, queryByText, rerender } = render(
    <Accordion openId={null} onToggle={spy}>
      <AccordionItem title="Trains" id="trains" data-testid="trains-button">
        Trains go choo choo
      </AccordionItem>
      <AccordionItem title="Boats" id="boats" data-testid="boats-button">
        Boats float
      </AccordionItem>
    </Accordion>,
  );

  const trains = queryByText('Trains go choo choo')!;
  const boats = queryByText('Boats float')!;

  // All closed initially
  expect(trains.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(boats.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );

  // Click trains — onToggle called with the id
  fireEvent.click(getByTestId('trains-button'));
  expect(spy).toHaveBeenCalledWith('trains');

  // In controlled mode, nothing changes until parent re-renders
  expect(trains.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );

  // Parent updates openId
  rerender(
    <Accordion openId="trains" onToggle={spy}>
      <AccordionItem title="Trains" id="trains" data-testid="trains-button">
        Trains go choo choo
      </AccordionItem>
      <AccordionItem title="Boats" id="boats" data-testid="boats-button">
        Boats float
      </AccordionItem>
    </Accordion>,
  );
  act(() => {
    jest.runAllTimers();
  });

  expect(trains.closest('.eds-base-expand')).not.toHaveAttribute('aria-hidden');
  expect(boats.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );

  // Click boats
  fireEvent.click(getByTestId('boats-button'));
  expect(spy).toHaveBeenCalledWith('boats');

  rerender(
    <Accordion openId="boats" onToggle={spy}>
      <AccordionItem title="Trains" id="trains" data-testid="trains-button">
        Trains go choo choo
      </AccordionItem>
      <AccordionItem title="Boats" id="boats" data-testid="boats-button">
        Boats float
      </AccordionItem>
    </Accordion>,
  );
  act(() => {
    jest.runAllTimers();
  });

  expect(trains.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(boats.closest('.eds-base-expand')).not.toHaveAttribute('aria-hidden');

  // Click boats again to close
  fireEvent.click(getByTestId('boats-button'));
  expect(spy).toHaveBeenCalledWith(null);
});

test('Accordion defaultOpenId sets initial open item', () => {
  const { queryByText } = render(
    <Accordion defaultOpenId="boats">
      <AccordionItem title="Trains" id="trains">
        Trains go choo choo
      </AccordionItem>
      <AccordionItem title="Boats" id="boats">
        Boats float
      </AccordionItem>
    </Accordion>,
  );

  act(() => {
    jest.runAllTimers();
  });

  const trains = queryByText('Trains go choo choo')!;
  const boats = queryByText('Boats float')!;

  expect(trains.closest('.eds-base-expand')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(boats.closest('.eds-base-expand')).not.toHaveAttribute('aria-hidden');
});
