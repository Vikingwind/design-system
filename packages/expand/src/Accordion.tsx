import React from 'react';

type Id = string | null;
type AccordionContextType = [Id, (id: Id) => void];
const AccordionContext = React.createContext<AccordionContextType | null>(null);

export type AccordionProps = {
  /** To eller flere AccordionItem-komponenter */
  children: React.ReactNode;
  /** ID-en til det åpne panelet. Brukes for kontrollert modus, sammen med onToggle. */
  openId?: Id;
  /** Kalles når et panel åpnes eller lukkes. Mottar IDen til panelet som ble åpnet, eller null om det ble lukket. */
  onToggle?: (id: Id) => void;
  /** ID-en til panelet som skal være åpent som standard (ukontrollert modus) */
  defaultOpenId?: Id;
  [key: string]: any;
};

export const Accordion: React.FC<AccordionProps> = ({
  openId: controlledOpenId,
  onToggle,
  defaultOpenId = null,
  children,
  ...rest
}) => {
  const [internalOpenId, setInternalOpenId] = React.useState<Id>(defaultOpenId);
  const isControlled = controlledOpenId !== undefined;
  const openId = isControlled ? controlledOpenId : internalOpenId;

  const setOpenId = React.useCallback(
    (id: Id) => {
      if (!isControlled) {
        setInternalOpenId(id);
      }
      onToggle?.(id);
    },
    [isControlled, onToggle],
  );

  const contextValue = React.useMemo<AccordionContextType>(
    () => [openId, setOpenId],
    [openId, setOpenId],
  );

  return (
    <AccordionContext.Provider value={contextValue} {...rest}>
      {children}
    </AccordionContext.Provider>
  );
};

type UseAccordionArgs = {
  id: Id;
  defaultOpen?: boolean;
};

export const useAccordion: ({ id, defaultOpen }: UseAccordionArgs) => {
  isOpen: boolean;
  toggle: () => void;
} = ({ id, defaultOpen }: UseAccordionArgs) => {
  const contextValue = React.useContext(AccordionContext);
  if (!contextValue) {
    throw new Error('You need to wrap your AccordionItem inside an Accordion');
  }

  const [openId, setOpenId] = contextValue;

  React.useEffect(() => {
    if (defaultOpen) {
      setOpenId(id);
    }
  }, [defaultOpen, id, setOpenId]);

  const isOpen = openId === id;

  return {
    isOpen,
    toggle: () => setOpenId(isOpen ? null : id),
  };
};
