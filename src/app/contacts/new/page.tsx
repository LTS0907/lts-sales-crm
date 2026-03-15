import ContactForm from '@/components/contacts/ContactForm'

export default function NewContactPage() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">新しい名刺を登録</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <ContactForm mode="create" />
      </div>
    </div>
  )
}
